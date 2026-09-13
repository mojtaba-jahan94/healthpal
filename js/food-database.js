/**
 * Default Food Database - پایگاه داده غذاهای پیش‌فرض
 * شامل غذاهای پرمصرف ایرانی و بین‌المللی
 * مقادیر به ازای هر ۱۰۰ گرم (یا واحد مشخص شده) ثبت شده‌اند.
 */
export const DEFAULT_FOODS = [
  // --- نان و غلات ---
  {
    id: 'food_1',
    name: 'نان سنگک',
    nameEn: 'Sangak Bread',
    category: 'نان و غلات',
    unit: 'کف دست (حدود ۳۰ گرم)',
    unitWeight: 30,
    calories: 75,
    carbs: 15,
    protein: 2.5,
    fat: 0.5
  },
  {
    id: 'food_2',
    name: 'نان بربری',
    nameEn: 'Barbari Bread',
    category: 'نان و غلات',
    unit: 'کف دست (حدود ۳۰ گرم)',
    unitWeight: 30,
    calories: 80,
    carbs: 16,
    protein: 2.6,
    fat: 0.6
  },
  {
    id: 'food_3',
    name: 'نان لواش',
    nameEn: 'Lavash Bread',
    category: 'نان و غلات',
    unit: 'کف دست (حدود ۲۰ گرم)',
    unitWeight: 20,
    calories: 50,
    carbs: 10.5,
    protein: 1.5,
    fat: 0.3
  },
  {
    id: 'food_4',
    name: 'نان تست سبوس‌دار / جو',
    nameEn: 'Whole Wheat Toast',
    category: 'نان و غلات',
    unit: 'یک برش (حدود ۳۰ گرم)',
    unitWeight: 30,
    calories: 75,
    carbs: 13,
    protein: 3.5,
    fat: 1.0
  },
  {
    id: 'food_5',
    name: 'برنج کته سفید (پخته)',
    nameEn: 'Cooked White Rice',
    category: 'نان و غلات',
    unit: '۱۰۰ گرم (حدود ۵ قاشق)',
    unitWeight: 100,
    calories: 130,
    carbs: 28,
    protein: 2.7,
    fat: 0.3
  },
  {
    id: 'food_6',
    name: 'برنج زعفرانی با روغن (پلو)',
    nameEn: 'Persian Polo with Oil',
    category: 'نان و غلات',
    unit: '۱۰۰ گرم (حدود ۵ قاشق)',
    unitWeight: 100,
    calories: 180,
    carbs: 28,
    protein: 2.5,
    fat: 6.0
  },
  {
    id: 'food_7',
    name: 'ماکارونی پخته با سس گوشت',
    nameEn: 'Macaroni with Meat Sauce',
    category: 'نان و غلات',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 175,
    carbs: 22,
    protein: 7.5,
    fat: 6.5
  },
  {
    id: 'food_8',
    name: 'جو دوسر پرک (خام)',
    nameEn: 'Rolled Oats (Raw)',
    category: 'نان و غلات',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 389,
    carbs: 66,
    protein: 16.9,
    fat: 6.9
  },

  // --- غذاهای اصیل ایرانی ---
  {
    id: 'food_9',
    name: 'چلوکباب کوبیده (یک سیخ + برنج)',
    nameEn: 'Chelo Kabab Koobideh',
    category: 'غذاهای ایرانی',
    unit: 'یک پرس معمولی',
    unitWeight: 450,
    calories: 750,
    carbs: 70,
    protein: 32,
    fat: 38
  },
  {
    id: 'food_10',
    name: 'چلو جوجه کباب (سینه مرغ + برنج)',
    nameEn: 'Chelo Joojeh Kabab',
    category: 'غذاهای ایرانی',
    unit: 'یک پرس معمولی',
    unitWeight: 400,
    calories: 620,
    carbs: 68,
    protein: 42,
    fat: 18
  },
  {
    id: 'food_11',
    name: 'قورمه سبزی (خورشت بدون برنج)',
    nameEn: 'Ghormeh Sabzi Stew',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 160,
    carbs: 7,
    protein: 9,
    fat: 11
  },
  {
    id: 'food_12',
    name: 'قیمه سیب‌زمینی (خورشت بدون برنج)',
    nameEn: 'Gheimeh Stew',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 185,
    carbs: 12,
    protein: 8.5,
    fat: 12
  },
  {
    id: 'food_13',
    name: 'زرشک پلو با مرغ',
    nameEn: 'Zereshk Polo Morgh',
    category: 'غذاهای ایرانی',
    unit: 'یک پرس معمولی',
    unitWeight: 450,
    calories: 680,
    carbs: 75,
    protein: 38,
    fat: 22
  },
  {
    id: 'food_14',
    name: 'عدس پلو با کشمش و گوشت چرخ‌کرده',
    nameEn: 'Adas Polo with Meat',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 210,
    carbs: 31,
    protein: 8.5,
    fat: 6.0
  },
  {
    id: 'food_15',
    name: 'خوراک عدسی',
    nameEn: 'Adasi (Lentil Soup)',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 115,
    carbs: 18,
    protein: 7.5,
    fat: 2.0
  },
  {
    id: 'food_16',
    name: 'خوراک لوبیا چیتی با قارچ',
    nameEn: 'Pinto Bean Stew',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 125,
    carbs: 20,
    protein: 7.0,
    fat: 2.5
  },
  {
    id: 'food_17',
    name: 'کوکو سبزی',
    nameEn: 'Kookoo Sabzi',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم (حدود یک برش)',
    unitWeight: 100,
    calories: 190,
    carbs: 6,
    protein: 7,
    fat: 16
  },
  {
    id: 'food_18',
    name: 'کوکو سیب‌زمینی',
    nameEn: 'Kookoo Sibzamini',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 210,
    carbs: 20,
    protein: 6,
    fat: 12
  },
  {
    id: 'food_19',
    name: 'کتلت گوشت',
    nameEn: 'Meat Kotlet',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم (حدود دو عدد)',
    unitWeight: 100,
    calories: 240,
    carbs: 14,
    protein: 16,
    fat: 14
  },
  {
    id: 'food_20',
    name: 'آش رشته با کشک و پیازداغ',
    nameEn: 'Ash Reshteh',
    category: 'غذاهای ایرانی',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 140,
    carbs: 18,
    protein: 5.5,
    fat: 5.5
  },

  // --- گوشت، مرغ، ماهی و پروتئین‌ها ---
  {
    id: 'food_21',
    name: 'سینه مرغ آب‌پز یا گریل شده',
    nameEn: 'Grilled Chicken Breast',
    category: 'پروتئین',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 165,
    carbs: 0,
    protein: 31,
    fat: 3.6
  },
  {
    id: 'food_22',
    name: 'ران مرغ پخته شده',
    nameEn: 'Chicken Thigh Cooked',
    category: 'پروتئین',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 210,
    carbs: 0,
    protein: 26,
    fat: 11
  },
  {
    id: 'food_23',
    name: 'تخم مرغ آب‌پز',
    nameEn: 'Boiled Egg',
    category: 'پروتئین',
    unit: 'یک عدد متوسط (حدود ۵۰ گرم)',
    unitWeight: 50,
    calories: 78,
    carbs: 0.6,
    protein: 6.3,
    fat: 5.3
  },
  {
    id: 'food_24',
    name: 'تخم مرغ نیمرو با روغن',
    nameEn: 'Fried Egg',
    category: 'پروتئین',
    unit: 'یک عدد',
    unitWeight: 55,
    calories: 110,
    carbs: 0.6,
    protein: 6.3,
    fat: 9.2
  },
  {
    id: 'food_25',
    name: 'سفیده تخم مرغ',
    nameEn: 'Egg White',
    category: 'پروتئین',
    unit: 'یک عدد (حدود ۳۳ گرم)',
    unitWeight: 33,
    calories: 17,
    carbs: 0.2,
    protein: 3.6,
    fat: 0.1
  },
  {
    id: 'food_26',
    name: 'کنسرو تن ماهی در روغن (روغن گرفته)',
    nameEn: 'Canned Tuna in Oil (Drained)',
    category: 'پروتئین',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 198,
    carbs: 0,
    protein: 29,
    fat: 8.2
  },
  {
    id: 'food_27',
    name: 'ماهی سالمون گریل شده',
    nameEn: 'Grilled Salmon',
    category: 'پروتئین',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 206,
    carbs: 0,
    protein: 22,
    fat: 12.3
  },
  {
    id: 'food_28',
    name: 'گوشت گوساله بدون چربی پخته',
    nameEn: 'Lean Cooked Beef',
    category: 'پروتئین',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 215,
    carbs: 0,
    protein: 28,
    fat: 10.5
  },

  // --- لبنیات ---
  {
    id: 'food_29',
    name: 'شیر کم‌چرب (۱.۵٪)',
    nameEn: 'Low Fat Milk (1.5%)',
    category: 'لبنیات',
    unit: 'یک لیوان (حدود ۲۴۰ میلی‌لیتر)',
    unitWeight: 240,
    calories: 105,
    carbs: 12,
    protein: 8,
    fat: 3.6
  },
  {
    id: 'food_30',
    name: 'ماست کم‌چرب',
    nameEn: 'Low Fat Yogurt',
    category: 'لبنیات',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 55,
    carbs: 6,
    protein: 4,
    fat: 1.5
  },
  {
    id: 'food_31',
    name: 'ماست یونانی پرپروتئین',
    nameEn: 'Greek Yogurt High Protein',
    category: 'لبنیات',
    unit: '۱۰۰ گرم',
    unitWeight: 100,
    calories: 90,
    carbs: 4,
    protein: 10,
    fat: 4.5
  },
  {
    id: 'food_32',
    name: 'پنیر سفید صبحانه / فتا',
    nameEn: 'Feta / White Cheese',
    category: 'لبنیات',
    unit: 'یک قوطی کبریت (حدود ۳۰ گرم)',
    unitWeight: 30,
    calories: 75,
    carbs: 1.2,
    protein: 4.5,
    fat: 6.0
  },

  // --- میوه و سبزیجات ---
  {
    id: 'food_33',
    name: 'سیب درختی',
    nameEn: 'Apple',
    category: 'میوه و سبزیجات',
    unit: 'یک عدد متوسط (حدود ۱۵۰ گرم)',
    unitWeight: 150,
    calories: 78,
    carbs: 21,
    protein: 0.4,
    fat: 0.3
  },
  {
    id: 'food_34',
    name: 'موز',
    nameEn: 'Banana',
    category: 'میوه و سبزیجات',
    unit: 'یک عدد متوسط (حدود ۱۲۰ گرم)',
    unitWeight: 120,
    calories: 105,
    carbs: 27,
    protein: 1.3,
    fat: 0.4
  },
  {
    id: 'food_35',
    name: 'پرتقال',
    nameEn: 'Orange',
    category: 'میوه و سبزیجات',
    unit: 'یک عدد متوسط (حدود ۱۳۰ گرم)',
    unitWeight: 130,
    calories: 62,
    carbs: 15,
    protein: 1.2,
    fat: 0.2
  },
  {
    id: 'food_36',
    name: 'خرما (مضافتی یا کبکاب)',
    nameEn: 'Date (Khorma)',
    category: 'میوه و سبزیجات',
    unit: 'یک عدد (حدود ۱۰ گرم)',
    unitWeight: 10,
    calories: 28,
    carbs: 7.5,
    protein: 0.2,
    fat: 0.05
  },
  {
    id: 'food_37',
    name: 'سالاد فصل (کاهو، خیار، گوجه، هویج)',
    nameEn: 'Fresh Garden Salad (No Dressing)',
    category: 'میوه و سبزیجات',
    unit: 'یک کاسه (حدود ۲۰۰ گرم)',
    unitWeight: 200,
    calories: 45,
    carbs: 9,
    protein: 2.2,
    fat: 0.4
  },
  {
    id: 'food_38',
    name: 'خیار',
    nameEn: 'Cucumber',
    category: 'میوه و سبزیجات',
    unit: 'یک عدد متوسط (حدود ۱۰۰ گرم)',
    unitWeight: 100,
    calories: 15,
    carbs: 3.5,
    protein: 0.6,
    fat: 0.1
  },
  {
    id: 'food_39',
    name: 'گوجه فرنگی',
    nameEn: 'Tomato',
    category: 'میوه و سبزیجات',
    unit: 'یک عدد متوسط (حدود ۱۲۰ گرم)',
    unitWeight: 120,
    calories: 22,
    carbs: 4.8,
    protein: 1.1,
    fat: 0.2
  },

  // --- چربی‌ها، مغزها و آجیل ---
  {
    id: 'food_40',
    name: 'روغن زیتون',
    nameEn: 'Olive Oil',
    category: 'چربی و مغزها',
    unit: 'یک قاشق غذاخوری (حدود ۱۴ گرم)',
    unitWeight: 14,
    calories: 120,
    carbs: 0,
    protein: 0,
    fat: 14
  },
  {
    id: 'food_41',
    name: 'گردو',
    nameEn: 'Walnut',
    category: 'چربی و مغزها',
    unit: 'یک عدد کامل (حدود ۵ گرم)',
    unitWeight: 5,
    calories: 33,
    carbs: 0.7,
    protein: 0.8,
    fat: 3.3
  },
  {
    id: 'food_42',
    name: 'بادام درختی',
    nameEn: 'Almond',
    category: 'چربی و مغزها',
    unit: '۱۰ عدد (حدود ۱۲ گرم)',
    unitWeight: 12,
    calories: 70,
    carbs: 2.5,
    protein: 2.6,
    fat: 6.1
  },
  {
    id: 'food_43',
    name: 'کره بادام زمینی',
    nameEn: 'Peanut Butter',
    category: 'چربی و مغزها',
    unit: 'یک قاشق غذاخوری (حدود ۱۶ گرم)',
    unitWeight: 16,
    calories: 95,
    carbs: 3.2,
    protein: 4.0,
    fat: 8.1
  }
];

export const FOOD_CATEGORIES = [
  'همه',
  'نان و غلات',
  'غذاهای ایرانی',
  'پروتئین',
  'لبنیات',
  'میوه و سبزیجات',
  'چربی و مغزها'
];
