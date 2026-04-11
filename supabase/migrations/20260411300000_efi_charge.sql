-- Suporte a pagamentos via cartão (EFI Pay Link de Pagamento)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS efi_charge_id INTEGER;

-- índice para o webhook encontrar o pedido pelo charge_id
CREATE INDEX IF NOT EXISTS idx_pedidos_efi_charge_id ON pedidos (efi_charge_id);
