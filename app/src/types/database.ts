export interface Company {
  id: string
  company_code: string
  company_id: string
  company_name: string
  business_number?: string
  representative?: string
  phone?: string
  fax?: string
  email?: string
  address?: string
  business_type?: string
  business_category?: string
  status: 'active' | 'inactive' | 'pending'
  dropbox_app_key?: string
  dropbox_app_secret?: string
  dropbox_access_token?: string
  dropbox_path?: string
  mail_service?: string
  smtp_server?: string
  smtp_port?: string
  mail_email?: string
  mail_id?: string
  mail_password?: string
  stamp_image_url?: string
  logo_image_url?: string
  created_at: string
}

export interface User {
  id: string
  company_id: string
  user_id: string
  name: string
  email?: string
  phone?: string
  role: 'admin' | 'user'
  created_at: string
}

export interface Category {
  id: string
  company_id: string
  name: string
  sort_order: number
}

export interface Client {
  id: string
  company_id: string
  name: string
  contact_person?: string
  phone?: string
  mobile?: string
  email?: string
}

export interface Supplier {
  id: string
  company_id: string
  name: string
  contact_person?: string
  phone?: string
  fax?: string
  email?: string
}

export interface FormTemplate {
  id: string
  company_id: string
  name: string
  columns: ColumnDef[]
  formulas: FormulaDef[]
  sort_order: number
}

export interface ColumnDef {
  name: string
  type: 'text' | 'number' | 'auto'
  width?: string
}

export interface FormulaDef {
  target: string
  expression: string
}

export interface Order {
  id: string
  company_id: string
  order_no: string
  created_by?: string
  order_date: string
  client_name?: string
  client_id?: string
  orderer?: string
  contact?: string
  email?: string
  product_type?: string
  title: string
  category_id?: string
  trade_type: 'vat' | 'novat'
  tax_invoice?: string
  payment?: string
  paper_type?: string
  color?: string
  print_side?: string
  copies?: string
  binding?: string
  paper_size?: string
  coating?: string
  finishing?: string
  detail_spec?: string
  status: 'progress' | 'complete'
  total_supply: number
  total_vat: number
  total_amount: number
  extra1?: string; extra2?: string; extra3?: string; extra4?: string; extra5?: string
  extra6?: string; extra7?: string; extra8?: string; extra9?: string; extra10?: string
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  template_id?: string
  sort_order: number
  data: Record<string, string | number>
}

export interface PurchaseOrder {
  id: string
  company_id: string
  po_no: string
  created_by?: string
  po_date: string
  supplier_id?: string
  supplier_name?: string
  orderer?: string
  contact?: string
  request_note?: string
  created_at: string
}

export interface PurchaseOrderItem {
  id: string
  po_id: string
  sort_order: number
  product_name?: string
  spec?: string
  paper_grain?: string
  cut_size?: string
  quantity?: string
  received?: string
}

export interface Memo {
  id: string
  company_id: string
  created_by?: string
  title: string
  content?: string
  created_at: string
}

export interface Notice {
  id: string
  company_id: string
  created_by?: string
  title: string
  content?: string
  is_completed: boolean
  completed_by?: string
  completed_at?: string
  created_at: string
}

export interface Advertisement {
  id: string
  type: 'banner' | 'popup'
  title?: string
  content?: string
  link_url?: string
  button_text?: string
  banner_color?: string
  image_url?: string
  is_active: boolean
  start_date?: string
  end_date?: string
}

export interface SessionData {
  company: Company
  user: User
}
