-- ============================================
-- Blackcopy.kr 인쇄전용 ERP Bcount
-- 데이터베이스 스키마
-- ============================================

-- 1. 업체 (companies)
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_code VARCHAR(20) UNIQUE NOT NULL,
  company_id VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(100) NOT NULL,
  business_number VARCHAR(20),
  representative VARCHAR(50),
  phone VARCHAR(20),
  fax VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  business_type VARCHAR(100),
  business_category VARCHAR(100),
  password VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  -- Dropbox 설정
  dropbox_app_key VARCHAR(100),
  dropbox_app_secret VARCHAR(255),
  dropbox_access_token TEXT,
  dropbox_path VARCHAR(255),
  -- 이메일 설정
  mail_service VARCHAR(20) DEFAULT 'naver',
  smtp_server VARCHAR(100),
  smtp_port VARCHAR(10),
  smtp_ssl VARCHAR(10),
  mail_email VARCHAR(100),
  mail_id VARCHAR(100),
  mail_password VARCHAR(255),
  -- 이미지
  stamp_image_url TEXT,
  logo_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 사용자 (users)
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id VARCHAR(50) NOT NULL,
  name VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

-- 3. 카테고리 (categories)
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 거래처 (clients)
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(50),
  phone VARCHAR(20),
  mobile VARCHAR(20),
  email VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 발주처 (suppliers)
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(50),
  phone VARCHAR(20),
  fax VARCHAR(20),
  email VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 표양식 템플릿 (form_templates)
CREATE TABLE form_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]',
  formulas JSONB NOT NULL DEFAULT '[]',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 작업 (orders) - 주문서/작업등록
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  order_no VARCHAR(30) NOT NULL,
  created_by UUID REFERENCES users(id),
  order_date DATE DEFAULT CURRENT_DATE,
  -- 기본 정보
  client_name VARCHAR(100),
  client_id UUID REFERENCES clients(id),
  orderer VARCHAR(50),
  contact VARCHAR(50),
  email VARCHAR(100),
  product_type VARCHAR(100),
  title VARCHAR(255) NOT NULL,
  category_id UUID REFERENCES categories(id),
  -- 거래 정보
  trade_type VARCHAR(20) DEFAULT 'vat',
  tax_invoice VARCHAR(50),
  payment VARCHAR(100),
  -- 작업 내용
  paper_type VARCHAR(50),
  color VARCHAR(20),
  print_side VARCHAR(20),
  copies VARCHAR(50),
  binding VARCHAR(50),
  paper_size VARCHAR(50),
  coating VARCHAR(20),
  finishing VARCHAR(50),
  -- 세부사양
  detail_spec TEXT,
  -- 상태
  status VARCHAR(20) DEFAULT 'progress' CHECK (status IN ('progress', 'complete')),
  -- 금액
  total_supply DECIMAL(15,0) DEFAULT 0,
  total_vat DECIMAL(15,0) DEFAULT 0,
  total_amount DECIMAL(15,0) DEFAULT 0,
  -- 예비항목
  extra1 TEXT, extra2 TEXT, extra3 TEXT, extra4 TEXT, extra5 TEXT,
  extra6 TEXT, extra7 TEXT, extra8 TEXT, extra9 TEXT, extra10 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, order_no)
);

-- 8. 작업 품목 (order_items)
CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  template_id UUID REFERENCES form_templates(id),
  sort_order INT DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 첨부파일 (attachments)
CREATE TABLE attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  file_type VARCHAR(100),
  dropbox_path TEXT,
  dropbox_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. 발주서 (purchase_orders)
CREATE TABLE purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  po_no VARCHAR(30) NOT NULL,
  created_by UUID REFERENCES users(id),
  po_date DATE DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name VARCHAR(100),
  orderer VARCHAR(50),
  contact VARCHAR(20),
  request_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, po_no)
);

-- 11. 발주서 품목 (purchase_order_items)
CREATE TABLE purchase_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sort_order INT DEFAULT 0,
  product_name VARCHAR(255),
  spec VARCHAR(50),
  paper_grain VARCHAR(20),
  cut_size VARCHAR(50),
  quantity VARCHAR(50),
  received VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. 작업메모 (memos)
CREATE TABLE memos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. 작업전달 (notices)
CREATE TABLE notices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  content TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. 최고관리자 (super_admins)
CREATE TABLE super_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. 광고 설정 (advertisements)
CREATE TABLE advertisements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('banner', 'popup')),
  title VARCHAR(255),
  content TEXT,
  link_url VARCHAR(500),
  button_text VARCHAR(50),
  banner_color VARCHAR(20),
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_orders_company ON orders(company_id);
CREATE INDEX idx_orders_date ON orders(order_date DESC);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_clients_company ON clients(company_id);
CREATE INDEX idx_suppliers_company ON suppliers(company_id);
CREATE INDEX idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX idx_memos_company ON memos(company_id);
CREATE INDEX idx_notices_company ON notices(company_id);
CREATE INDEX idx_notices_active ON notices(company_id, is_completed);

-- ============================================
-- RLS (Row Level Security) 정책
-- ============================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 초기 데이터
-- ============================================
INSERT INTO super_admins (admin_id, password) VALUES ('blackcopy2', '@kingsize2');

INSERT INTO advertisements (type, title, content, link_url, button_text, banner_color, is_active)
VALUES ('banner', '홍보 배너', '인쇄/출력 작업기록, 견적서, 거래명세서, 발주서까지 올인원 업무관리', 'https://blackcopy.kr', 'FREE', '#2563eb', true);
