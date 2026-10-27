import '@mantine/core/styles.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import App from './App.jsx'

const theme = createTheme({
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  headings: { fontWeight: '500' },
  primaryColor: 'lart',
  primaryShade: 5,
  autoContrast: true,
  colors: {
    lart: ['#fff9cc', '#fff3a3', '#ffeb7a', '#ffe652', '#ffdd29', '#ffd400', '#e6bf00', '#c9a700', '#ad9000', '#8f7800'],
    dark: ['#f4f2e9', '#d8d9cc', '#bfc1b4', '#a7a99e', '#707367', '#454740', '#34362f', '#292a27', '#20211f', '#181914'],
  },
  fontSizes: { xs: '0.8125rem', sm: '0.875rem' },
  defaultRadius: 'md',
})

createRoot(document.getElementById('root')).render(
  <MantineProvider theme={theme} forceColorScheme="dark">
    <App />
  </MantineProvider>,
)
