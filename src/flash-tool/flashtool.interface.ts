export interface Drive {
  size: number;
  description: string;
  device: string;
}

export interface FlashOutput {
  mode: 'flashing' | 'validating';
  percent: number;
  eta: number;
}
