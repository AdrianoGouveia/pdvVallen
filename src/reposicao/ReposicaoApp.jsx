import { useState } from 'react'
import SelecaoArmazem   from './pages/SelecaoArmazem.jsx'
import ScannerReposicao from './pages/ScannerReposicao.jsx'
import ProdutoForm      from './pages/ProdutoForm.jsx'

// Telas: 'selecao' → 'scanner' → 'produto'
export default function ReposicaoApp() {
  const [tela, setTela] = useState('selecao')
  const [ctx, setCtx]   = useState(null)  // { condominio, armazem }
  const [prod, setProd] = useState(null)  // { produto, estoqueItem }

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {tela === 'selecao' && (
        <SelecaoArmazem
          onEntrar={c => { setCtx(c); setTela('scanner') }}
        />
      )}
      {tela === 'scanner' && (
        <ScannerReposicao
          ctx={ctx}
          onProduto={p => { setProd(p); setTela('produto') }}
          onVoltar={() => setTela('selecao')}
        />
      )}
      {tela === 'produto' && (
        <ProdutoForm
          ctx={ctx}
          prod={prod}
          onSalvo={() => setTela('scanner')}
          onVoltar={() => setTela('scanner')}
        />
      )}
    </div>
  )
}
