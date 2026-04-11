-- Configuração de gateway de pagamento
CREATE TABLE IF NOT EXISTS config_pagamento (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  provider_modo    TEXT    NOT NULL DEFAULT 'auto',
    -- 'asaas'  → sempre usa Asaas
    -- 'efi'    → sempre usa EFI Pay
    -- 'auto'   → EFI até limite_efi, Asaas acima
  limite_efi       NUMERIC(10,2) NOT NULL DEFAULT 80.00,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_provider_modo CHECK (provider_modo IN ('asaas', 'efi', 'auto'))
);

-- Garante que sempre exista exatamente 1 linha de configuração
INSERT INTO config_pagamento (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Coluna na tabela pedidos para identificar qual provider foi usado
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'asaas';
-- Campo para guardar txid da EFI (para o webhook bater)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS efi_txid TEXT;

-- RLS
ALTER TABLE config_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura config pagamento" ON config_pagamento FOR SELECT USING (true);
CREATE POLICY "Gestao config pagamento"  ON config_pagamento FOR ALL   USING (true);
