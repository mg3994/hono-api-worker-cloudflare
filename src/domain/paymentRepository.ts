export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  method: 'card' | 'bank' | 'crypto' | 'google_pay' | 'apple_pay';
  status: 'initiated' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
  createdAt: number;

  // Google / Apple Pay reference values
  gatewayReferenceId?: string;
  bankReferenceId?: string;
  networkTransactionId?: string;
}

export interface IPaymentRepository {
  createPayment(payment: Payment): Promise<void>;
  getPaymentById(id: string): Promise<Payment | null>;
  getPaymentsByOrder(orderId: string): Promise<Payment[]>;
  updatePaymentStatus(id: string, status: 'initiated' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'): Promise<void>;
}
