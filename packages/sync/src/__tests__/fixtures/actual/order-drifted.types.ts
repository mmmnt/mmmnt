export interface Order {
  readonly orderId: string;
  readonly amount: string; // changed from number
  readonly status: OrderStatus;
  readonly notes: string; // added field
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'cancelled'; // added variant
