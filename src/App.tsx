import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './ui/components/Layout'
import { Inicio } from './ui/screens/Inicio'
import { Clientes } from './ui/screens/Clientes'
import { ClienteFormulario } from './ui/screens/ClienteFormulario'
import { ClienteFicha } from './ui/screens/ClienteFicha'
import { Contratos } from './ui/screens/Contratos'
import { ContratoNovo } from './ui/screens/ContratoNovo'
import { ContratoDetalhe } from './ui/screens/ContratoDetalhe'
import { Extrato } from './ui/screens/Extrato'
import { Vencimentos } from './ui/screens/Vencimentos'
import { Mais } from './ui/screens/Mais'
import { Regras } from './ui/screens/Regras'

function AoTrocarDeTela() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export function App() {
  return (
    <Layout>
      <AoTrocarDeTela />
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/novo" element={<ClienteFormulario modo="novo" />} />
        <Route path="/clientes/:id" element={<ClienteFicha />} />
        <Route path="/clientes/:id/editar" element={<ClienteFormulario modo="editar" />} />
        <Route path="/contratos" element={<Contratos />} />
        <Route path="/contratos/novo" element={<ContratoNovo />} />
        <Route path="/contratos/:id" element={<ContratoDetalhe />} />
        <Route path="/contratos/:id/extrato" element={<Extrato />} />
        <Route path="/vencimentos" element={<Vencimentos />} />
        <Route path="/mais" element={<Mais />} />
        <Route path="/mais/regras" element={<Regras />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
