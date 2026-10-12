import { inject } from 'vue'

export function useNavigation() {
  return inject('navigation')
}
