import { computed, ref } from 'vue'

const STORAGE_KEY = 'stocklart-local-data'
const MOVEMENTS_KEY = 'stocklart-movements'
const INITIAL_CATEGORIES = [
  { name: 'Resistências', props: ['valor (Ω)', 'tolerância (%)', 'potência (W)', 'encapsulamento'], image: false },
  { name: 'Condensadores', props: ['capacidade (µF)', 'tensão (V)', 'tipo', 'encapsulamento'], image: false },
  { name: 'LEDs', props: ['cor', 'tamanho (mm)', 'tensão direta (V)'], image: false },
  { name: 'Díodos', props: ['referência', 'tipo', 'tensão inversa (V)', 'corrente (A)'], image: false },
  { name: 'Transístores', props: ['referência', 'tipo (NPN/PNP)', 'ganho hFE', 'corrente máx (A)'], image: false },
  { name: 'Potenciómetros', props: ['valor (Ω)', 'tipo', 'eixo'], image: false },
  { name: 'Indutores', props: ['valor (µH)', 'corrente (A)'], image: false },
  { name: 'Cristais', props: ['frequência (MHz)'], image: false }
]
const CAROUSEL_IMAGES = [
  { url: '/lart-circuito.jpg', title: 'Eletrónica feita pela equipa' },
  { url: '/lart-garagem.jpg', title: 'O laboratório onde tudo acontece' },
  { url: '/lart-testes.jpg', title: 'Testar no terreno' },
  { url: '/lart-soldadura.jpg', title: 'Mãos à obra' }
]

export function createInventoryContext() {
  const categories = ref([])
  const items = ref([])
  const movements = ref([])
  const currentView = ref('home')
  const currentCategory = ref('')
  const query = ref('')
  const mode = ref('in')
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const itemDialog = ref(false)
  const categoryDialog = ref(false)
  const categoryEditDialog = ref(false)
  const editingCategory = ref('')
  const itemForm = ref({ category: '', props: {}, quantity: 1, imageFile: null })
  const categoryForm = ref({ name: '', props: '', image: false })
  const carouselIndex = ref(0)
  const carouselSlide = computed(() => CAROUSEL_IMAGES[carouselIndex.value])
  let carouselTimer
  let noticeTimer
  let initialized = false

  const activeCategory = computed(() => categories.value.find((category) => category.name === itemForm.value.category))
  const shownItems = computed(() => {
    const text = query.value.trim().toLowerCase().replace(/\s+/g, '')
    return items.value.filter((item) => {
      const matchesCategory = !currentCategory.value || item.cat === currentCategory.value
      const searchable = `${item.cat}${Object.values(item.props).join('')}`.toLowerCase().replace(/\s+/g, '')
      return matchesCategory && (!text || searchable.includes(text))
    })
  })
  const totalUnits = computed(() => items.value.reduce((total, item) => total + item.qty, 0))
  const categoryCount = computed(() => categories.value.length)

  function categoryTotal(name) {
    return items.value.filter((item) => !name || item.cat === name).reduce((total, item) => total + item.qty, 0)
  }
  function categoryColor(name) {
    let hash = 7
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360
    return `hsl(${hash} 68% 48%)`
  }
  function mainValue(item) {
    const props = item.props || {}
    return props.valor || props.capacidade || Object.values(props)[0] || 'Sem valor'
  }
  function flash(message) {
    notice.value = message
    window.clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => {
      notice.value = ''
    }, 2600)
  }
  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ categories: categories.value, items: items.value }))
    localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(movements.value))
  }
  function load() {
    const saved = localStorage.getItem(STORAGE_KEY)
    const data = saved ? JSON.parse(saved) : { categories: INITIAL_CATEGORIES, items: [] }
    categories.value = data.categories || []
    items.value = data.items || []
    const savedMovements = localStorage.getItem(MOVEMENTS_KEY)
    movements.value = savedMovements ? JSON.parse(savedMovements) : []
  }
  function setCategory(name) {
    currentCategory.value = name
  }
  function openStock() {
    currentView.value = 'stock'
  }
  function openHome() {
    currentView.value = 'home'
  }
  function nextSlide() {
    carouselIndex.value = (carouselIndex.value + 1) % CAROUSEL_IMAGES.length
  }
  function previousSlide() {
    carouselIndex.value = (carouselIndex.value - 1 + CAROUSEL_IMAGES.length) % CAROUSEL_IMAGES.length
  }
  function selectSlide(index) {
    carouselIndex.value = index
  }
  function resetItemForm() {
    itemForm.value = {
      category: currentCategory.value || categories.value[0]?.name || '',
      props: {},
      quantity: 1,
      imageFile: null
    }
    mode.value = 'in'
    error.value = ''
  }
  function updateItemCategory() {
    itemForm.value.props = {}
    itemForm.value.imageFile = null
  }
  function openItemDialog() {
    if (!categories.value.length) {
      flash('Cria primeiro uma categoria')
      return
    }
    resetItemForm()
    itemDialog.value = true
  }
  function closeItemDialog() {
    if (!busy.value) itemDialog.value = false
  }
  function onFileChange(event) {
    itemForm.value.imageFile = event.target.files?.[0] || null
  }
  function uploadImage() {
    if (!itemForm.value.imageFile) return ''
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem'))
      reader.readAsDataURL(itemForm.value.imageFile)
    })
  }
  function recordMovement({ item, type, delta, before, after }) {
    movements.value.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      type,
      delta,
      before,
      after,
      item: mainValue(item),
      category: item.cat
    })
  }
  async function submitItem() {
    error.value = ''
    busy.value = true
    try {
      const image = await uploadImage()
      const quantity = Number(itemForm.value.quantity)
      if (!Number.isInteger(quantity) || quantity < 1) throw new Error('A quantidade tem de ser 1 ou mais')
      if (
        !itemForm.value.category ||
        !Object.values(itemForm.value.props).length ||
        !Object.values(itemForm.value.props).every(Boolean)
      ) {
        throw new Error('Preenche a categoria e todas as propriedades')
      }
      const category = categories.value.find((current) => current.name === itemForm.value.category)
      if (!category) throw new Error('Categoria não encontrada')
      if (image && !category.image) throw new Error('Esta categoria não aceita imagens')
      const item = items.value.find(
        (current) =>
          current.cat === itemForm.value.category &&
          category.props.every((prop) => current.props[prop] === itemForm.value.props[prop])
      )
      if (mode.value === 'out') {
        if (!item) throw new Error('Esse item não existe no stock')
        if (item.qty < quantity) throw new Error(`Só há ${item.qty} em stock`)
        const before = item.qty
        item.qty -= quantity
        recordMovement({ item, type: 'out', delta: -quantity, before, after: item.qty })
      } else if (item) {
        const before = item.qty
        item.qty += quantity
        if (image) item.image = image
        recordMovement({ item, type: 'in', delta: quantity, before, after: item.qty })
      } else {
        const newItem = {
          id: Math.max(0, ...items.value.map((current) => current.id)) + 1,
          cat: itemForm.value.category,
          props: { ...itemForm.value.props },
          qty: quantity,
          image
        }
        items.value.push(newItem)
        recordMovement({ item: newItem, type: 'in', delta: quantity, before: 0, after: quantity })
      }
      saveData()
      itemDialog.value = false
      flash(
        mode.value === 'out'
          ? `Retirado. Restam ${item.qty}`
          : item
            ? `Quantidade somada: agora ${item.qty}`
            : 'Item novo adicionado'
      )
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = false
    }
  }
  function openCategoryDialog() {
    categoryForm.value = { name: '', props: '', image: false }
    error.value = ''
    categoryDialog.value = true
  }
  function openCategoryEdit(category) {
    editingCategory.value = category.name
    categoryForm.value = { name: category.name, props: category.props.join(', '), image: category.image }
    error.value = ''
    categoryEditDialog.value = true
  }
  async function submitCategory() {
    error.value = ''
    busy.value = true
    try {
      const name = categoryForm.value.name.trim()
      const props = categoryForm.value.props
        .split(',')
        .map((prop) => prop.trim())
        .filter(Boolean)
      if (!name || !props.length) throw new Error('Indica o nome e pelo menos uma propriedade')
      if (categories.value.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Essa categoria já existe')
      }
      categories.value.push({ name, props: [...new Set(props)], image: categoryForm.value.image })
      saveData()
      currentCategory.value = name
      categoryDialog.value = false
      flash('Categoria pronta para receber o primeiro item')
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = false
    }
  }
  async function submitCategoryEdit() {
    error.value = ''
    busy.value = true
    try {
      const name = categoryForm.value.name.trim()
      const props = [
        ...new Set(
          categoryForm.value.props
            .split(',')
            .map((prop) => prop.trim())
            .filter(Boolean)
        )
      ]
      if (!name || !props.length) throw new Error('Indica o nome e pelo menos uma propriedade')
      const category = categories.value.find((current) => current.name === editingCategory.value)
      if (!category) throw new Error('Categoria não encontrada')
      if (
        categories.value.some((current) => current.name.toLowerCase() === name.toLowerCase() && current !== category)
      ) {
        throw new Error('Essa categoria já existe')
      }
      const removedProps = category.props.filter((prop) => !props.includes(prop))
      if (
        items.value.some(
          (item) => item.cat === editingCategory.value && removedProps.some((prop) => prop in item.props)
        )
      ) {
        throw new Error(`Não podes remover ${removedProps.join(', ')}: existe(m) componente(s) com essa propriedade`)
      }
      if (!categoryForm.value.image && items.value.some((item) => item.cat === editingCategory.value && item.image)) {
        throw new Error('Não podes desativar imagens enquanto existirem componentes com imagem')
      }
      items.value.forEach((item) => {
        if (item.cat === editingCategory.value) {
          item.cat = name
          item.props = Object.fromEntries(props.map((prop) => [prop, item.props[prop] || '']))
        }
      })
      category.name = name
      category.props = props
      category.image = categoryForm.value.image
      if (currentCategory.value === editingCategory.value) currentCategory.value = name
      saveData()
      categoryEditDialog.value = false
      flash('Categoria atualizada')
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = false
    }
  }
  function changeQuantity(item, delta) {
    try {
      const before = item.qty
      const after = Math.max(0, item.qty + delta)
      if (after === before) return
      item.qty = after
      recordMovement({ item, type: delta > 0 ? 'in' : 'out', delta: after - before, before, after })
      saveData()
      flash(`${delta > 0 ? 'Entrada' : 'Saída'} de ${Math.abs(after - before)} unidade(s) registada`)
    } catch (err) {
      flash(err.message)
    }
  }
  function deleteItem(item) {
    if (!window.confirm(`Apagar o item ${mainValue(item)}?`)) return
    try {
      recordMovement({ item, type: 'delete', delta: -item.qty, before: item.qty, after: 0 })
      items.value = items.value.filter((current) => current.id !== item.id)
      saveData()
      flash('Item apagado')
    } catch (err) {
      flash(err.message)
    }
  }
  function deleteCategory(category) {
    const count = items.value.filter((item) => item.cat === category.name).length
    const message = count
      ? `Apagar ${category.name} e as ${count} referências associadas?`
      : `Apagar a categoria ${category.name}?`
    if (!window.confirm(message)) return
    try {
      categories.value = categories.value.filter((current) => current.name !== category.name)
      items.value = items.value.filter((item) => item.cat !== category.name)
      saveData()
      if (currentCategory.value === category.name) currentCategory.value = ''
      flash(message.includes('referências') ? `Categoria apagada com ${count} referência(s)` : 'Categoria apagada')
    } catch (err) {
      flash(err.message)
    }
  }

  function initialize() {
    if (initialized) return
    initialized = true
    try {
      load()
      carouselTimer = window.setInterval(nextSlide, 5000)
    } catch (err) {
      flash(err.message)
    }
  }
  function cleanup() {
    window.clearInterval(carouselTimer)
    window.clearTimeout(noticeTimer)
    initialized = false
  }

  return {
    categories,
    currentView,
    currentCategory,
    query,
    mode,
    busy,
    error,
    notice,
    movements,
    itemDialog,
    categoryDialog,
    categoryEditDialog,
    itemForm,
    categoryForm,
    activeCategory,
    carouselSlide,
    shownItems,
    totalUnits,
    categoryCount,
    carouselIndex,
    carouselImages: CAROUSEL_IMAGES,
    categoryTotal,
    categoryColor,
    mainValue,
    setCategory,
    selectSlide,
    openStock,
    openHome,
    nextSlide,
    previousSlide,
    openItemDialog,
    closeItemDialog,
    onFileChange,
    updateItemCategory,
    submitItem,
    openCategoryDialog,
    openCategoryEdit,
    submitCategory,
    submitCategoryEdit,
    changeQuantity,
    deleteItem,
    deleteCategory,
    initialize,
    cleanup
  }
}
