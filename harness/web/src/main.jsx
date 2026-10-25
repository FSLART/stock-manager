import '@mantine/core/styles.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import App from './App.jsx'

const theme = createTheme({
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  headings: { fontWeight: '500' },
  primaryColor: 'blue',
  defaultRadius: 'md',
})

createRoot(document.getElementById('root')).render(
  <MantineProvider theme={theme} forceColorScheme="dark">
    <App />
  </MantineProvider>,
)
