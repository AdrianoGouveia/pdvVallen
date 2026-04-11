import { PixModal } from './PixModal'

export function PaymentMethodModal({ items, total, unidadeId, onPaymentSuccess, onClose }) {
  return (
    <PixModal
      items={items}
      total={total}
      unidadeId={unidadeId}
      onPaymentSuccess={onPaymentSuccess}
      onClose={onClose}
    />
  )
}
