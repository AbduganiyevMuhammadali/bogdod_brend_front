// Mahsulot kartochkasidagi tanlov ro'yxatlari. Bitta joyda turadi, chunki
// ular ham mahsulot formasida, ham tezkor kiritish jadvalida ishlatiladi —
// ikkalasida bir xil bo'lishi kerak.
//
// Do'kon faqat kiyim-kechak sotadi, shuning uchun ro'yxatlar shu yo'nalishda.

export const UNITS = ['Dona', 'juft', "to'plam", 'quti', 'paket', 'metr', 'kg']

// Kiyim turi bo'yicha guruhlangan
export const GROUPS = [
  // Ustki kiyim
  'Futbolka', "Ko'ylak", 'Kofta', 'Sviter', 'Xudi', 'Bluzka', 'Mayka', 'Polo',
  // Pastki kiyim
  'Shim', 'Jinsi shim', 'Sport shim', 'Shortik', 'Yubka',
  // Ustki qavat
  'Kurtka', 'Palto', 'Jaket', 'Kostyum', 'Plash', 'Jilet',
  // Oyoq kiyim
  'Krossovka', 'Tufli', 'Botinka', 'Shippak', 'Etik', 'Sandal',
  // Ichki kiyim
  'Ichki kiyim', 'Paypoq', 'Kolgotka', 'Pijama', 'Xalat',
  // Bosh kiyim va aksessuar
  'Bosh kiyim', 'Kepka', 'Shapka', 'Sharf', "Qo'lqop", 'Kamar', 'Sumka', 'Galstuk',
  // Yosh bo'yicha
  'Bolalar kiyimi', 'Chaqaloq kiyimi',
]

export const BRANDS = [
  'Nike', 'Adidas', "Levi's", 'Zara', 'H&M', 'Puma', 'Reebok', 'Tommy Hilfiger',
  'Calvin Klein', 'Lacoste', 'Gucci', 'Boss', 'Uniqlo', 'Bershka', 'Pull&Bear',
  'Mango', 'Colin\'s', 'LC Waikiki', 'Defacto', 'Koton',
]

export const COUNTRIES = [
  "O'zbekiston", 'Turkiya', 'Xitoy', 'Rossiya', "Qozog'iston",
  'Bangladesh', 'Vetnam', 'Hindiston', 'Italiya', 'Germaniya', 'Koreya',
]

export const COLORS = [
  'Oq', 'Qora', "Ko'k", 'Qizil', 'Yashil', 'Sariq', 'Kulrang',
  'Binafsha', "To'q sariq", 'Pushti', "To'q ko'k", 'Jigarrang', 'Bej',
  'Xaki', 'Bordo', 'Kumush', 'Oltin',
]

export const CURRENCIES = ["So'm", 'USD', 'EUR', 'RUB']

// ── Razmerlar ──────────────────────────────────────────────────────────
// Do'kondagi amaliyotga mos uchta raqamli tizim va bitta harfli tizim.
export const SIZE_ALPHA = ['XS', 'S', 'M', 'L', 'XL', 'XXL',
                           '3XL', '4XL', '5XL', '6XL', '7XL', '8XL', '9XL', '10XL']
export const SIZE_JEANS   = ['29', '30', '31', '32', '33', '34']
export const SIZE_EVEN    = ['36', '38', '40', '42', '44', '46']
export const SIZE_CLASSIC = ['44', '46', '48', '50', '52', '54', '56', '58', '60']

// Raqamli tugmalar qatori — uchala to'plamning birlashmasi, takrorsiz
export const SIZE_NUM = [...new Set([...SIZE_JEANS, ...SIZE_EVEN, ...SIZE_CLASSIC])]

// Oyoq kiyim uchun alohida o'lchamlar
export const SIZE_SHOES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']
