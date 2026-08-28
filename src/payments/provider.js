export class PaymentProviderAdapter {
  constructor(name) {
    this.name = name;
  }

  async initiate() {
    throw new Error(`${this.name} provider is not configured`);
  }

  async reconcile() {
    throw new Error(`${this.name} provider reconciliation is not configured`);
  }
}
