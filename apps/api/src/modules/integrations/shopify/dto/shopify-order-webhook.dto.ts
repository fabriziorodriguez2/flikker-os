export interface ShopifyCustomerDto {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export interface ShopifyAddressDto {
  phone?: string;
}

export interface ShopifyOrderWebhookDto {
  id: number | string;
  email?: string;
  phone?: string;
  customer?: ShopifyCustomerDto;
  billing_address?: ShopifyAddressDto;
  shipping_address?: ShopifyAddressDto;
}
