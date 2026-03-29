export interface Order {
  readonly orderId: string;
  readonly amount: number;
  readonly status: OrderStatus;
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped';
