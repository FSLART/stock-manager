<script setup>
import WorkspacePage from '../components/WorkspacePage.vue'
</script>

<template>
  <WorkspacePage
    active="board-signals"
    eyebrow="Engenharia · documentação"
    title="Sinais de placas"
    description="Organiza sinais, interfaces e ligações importantes para cada placa."
  >
    <section class="workspace-grid">
      <article class="workspace-card workspace-card-wide">
        <div class="card-heading">
          <div>
            <span class="card-icon">↗</span>
            <h2>Biblioteca de sinais</h2>
          </div>
          <button class="primary-button" type="button">+ Novo sinal</button>
        </div>
        <p class="card-muted">
          Ainda não existem sinais registados. Cria o primeiro para começares a documentar as ligações das placas.
        </p>
        <div class="empty-workspace">A tua biblioteca de sinais aparecerá aqui.</div>
      </article>
      <article class="workspace-card">
        <p class="eyebrow">Estrutura recomendada</p>
        <h2>Documentação consistente</h2>
        <p class="card-muted">
          Usa nomes claros, tensão de referência e notas de ligação para reduzir erros na montagem.
        </p>
      </article>
    </section>
  </WorkspacePage>
</template>
