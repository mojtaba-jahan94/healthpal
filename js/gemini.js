/**
 * Smart Nutrition Assistant (با و بدون نیاز به API)
 * قابلیت استعلام خودکار از:
 * ۱. هوش مصنوعی Google Gemini (در صورت وجود API Key)
 * ۲. پایگاه داده جهانی OpenFoodFacts (کاملاً رایگان و بدون هیچ کلیدی)
 * ۳. موتور برآوردگر هوشمند داخلی (تحلیل محتوایی ترکیبات بدون اینترنت و بدون API)
 */

import { db } from './db.js';

class NutritionAssistant {
  constructor() {
    this.apiKey = null;
    this.model = 'gemini-1.5-flash';
  }

  async init() {
    const settings = await db.getSettings('gemini_ai');
    if (settings && settings.apiKey) {
      this.apiKey = settings.apiKey.trim();
    }
  }

  async saveApiKey(key) {
    this.apiKey = key.trim();
    await db.saveSettings({ id: 'gemini_ai', apiKey: this.apiKey });
    return true;
  }

  async getApiKey() {
    if (this.apiKey) return this.apiKey;
    const settings = await db.getSettings('gemini_ai');
    return settings?.apiKey || '';
  }

  /**
   * متد اصلی تحلیل و استعلام مشخصات غذا
   * به صورت خودکار اگر API وجود داشته باشد از Gemini استفاده می‌کند،
   * و اگر API نباشد، از دیتابیس جهانی OpenFoodFacts و موتور هوشمند داخلی رایگان استفاده می‌کند.
   */
  async analyzeFood(foodQuery) {
    const apiKey = await this.getApiKey();

    if (apiKey) {
      try {
        console.log('[Nutrition] Using Gemini AI with API Key...');
        return await this.callGeminiAPI(foodQuery, apiKey);
      } catch (err) {
        console.warn('[Nutrition] Gemini call failed, falling back to Zero-Key mode:', err);
        // اگر سهمیه تمام شده بود یا خطا داد، سوییچ به حالت بدون کلید
        return await this.zeroKeySearch(foodQuery);
      }
    } else {
      console.log('[Nutrition] No API Key provided, using Zero-Key Smart Assistant...');
      return await this.zeroKeySearch(foodQuery);
    }
  }

  /**
   * حالت بدون نیاز به هیچ کلید (Zero-Key Assistant)
   */
  async zeroKeySearch(foodQuery) {
    // ۱. ابتدا جستجو در پایگاه داده بین‌المللی OpenFoodFacts (رایگان و پابلیک)
    try {
      const offResult = await this.searchOpenFoodFacts(foodQuery);
      if (offResult) {
        return offResult;
      }
    } catch (e) {
      console.log('[OpenFoodFacts] Query error or no match, switching to smart local estimator:', e);
    }

    // ۲. در صورت نبودن در OpenFoodFacts، استفاده از موتور هوشمند محلی (تخمین دقیق ترکیبات)
    return this.smartLocalEstimate(foodQuery);
  }

  /**
   * جستجو در OpenFoodFacts API (بدون نیاز به کلید و ثبت‌نام)
   */
  async searchOpenFoodFacts(query) {
    const cleanQuery = query.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanQuery)}&search_simple=1&action=process&json=1&page_size=5`;

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.products && data.products.length > 0) {
      // پیدا کردن اولین محصولی که اطلاعات کالری دارد
      const product = data.products.find(p => p.nutriments && (p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal']));
      if (product) {
        const nut = product.nutriments;
        const cals = Math.round(nut['energy-kcal_100g'] || nut['energy-kcal'] || 0);
        const carbs = Math.round((nut.carbohydrates_100g || nut.carbohydrates || 0) * 10) / 10;
        const protein = Math.round((nut.proteins_100g || nut.proteins || 0) * 10) / 10;
        const fat = Math.round((nut.fat_100g || nut.fat || 0) * 10) / 10;

        if (cals > 0) {
          const servingUnit = product.serving_size || '۱۰۰ گرم';
          return {
            name: product.product_name_fa || product.product_name || query,
            category: this.guessCategory(query),
            unit: servingUnit,
            unitWeight: 100,
            calories: cals,
            carbs,
            protein,
            fat,
            description: `برگرفته از پایگاه جهانی OpenFoodFacts (${product.brands || 'تغذیه استاندارد'})`,
            source: 'openfoodfacts'
          };
        }
      }
    }
    return null;
  }

  /**
   * موتور هوشمند برآورد کالری و ماکروها بر اساس مؤلفه‌های غذا (کاملاً بدون نیاز به اینترنت یا API)
   */
  smartLocalEstimate(query) {
    const q = query.toLowerCase().trim();

    // تعیین ضرایب مقدار / سهم
    let multiplier = 1.0;
    let unitDesc = 'یک سهم معمولی';

    if (q.includes('دو ') || q.includes('۲ ') || q.includes('2 ')) multiplier *= 2.0;
    else if (q.includes('سه ') || q.includes('۳ ') || q.includes('3 ')) multiplier *= 3.0;
    else if (q.includes('نصف') || q.includes('نیم')) multiplier *= 0.5;

    if (q.includes('پرس') || q.includes('بشقاب') || q.includes('دیس')) {
      multiplier *= 1.3;
      unitDesc = 'یک پرس معمولی';
    } else if (q.includes('کاسه') || q.includes('پیاله')) {
      unitDesc = 'یک کاسه متوسط';
    } else if (q.includes('لیوان')) {
      unitDesc = 'یک لیوان (۲۴۰ میلی‌لیتر)';
    } else if (q.includes('قاشق')) {
      multiplier *= 0.2;
      unitDesc = 'یک قاشق غذاخوری';
    } else if (q.includes('گرم')) {
      unitDesc = '۱۰۰ گرم';
    } else if (q.includes('عدد') || q.includes('دانه')) {
      unitDesc = 'یک عدد';
    }

    // مقادیر پایه تغذیه
    let calories = 0;
    let carbs = 0;
    let protein = 0;
    let fat = 0;
    let category = 'غذاهای ایرانی';

    // پایه‌های نشاسته‌ای و غلات
    if (q.includes('برنج') || q.includes('چلو') || q.includes('پلو') || q.includes('کته')) {
      calories += 260;
      carbs += 50;
      protein += 5;
      fat += 4;
      category = 'غذاهای ایرانی';
    } else if (q.includes('ماکارونی') || q.includes('پاستا') || q.includes('اسپاگتی')) {
      calories += 280;
      carbs += 45;
      protein += 9;
      fat += 7;
      category = 'نان و غلات';
    } else if (q.includes('نان') || q.includes('تست') || q.includes('ساندویچ') || q.includes('باگت')) {
      calories += 180;
      carbs += 35;
      protein += 6;
      fat += 2;
      category = 'نان و غلات';
    } else if (q.includes('سوپ') || q.includes('آش')) {
      calories += 160;
      carbs += 22;
      protein += 7;
      fat += 5;
      category = 'غذاهای ایرانی';
    } else if (q.includes('سالاد')) {
      calories += 60;
      carbs += 10;
      protein += 3;
      fat += 1;
      category = 'میوه و سبزیجات';
    } else if (q.includes('پیتزا') || q.includes('برگر') || q.includes('سوسیس') || q.includes('کالباس')) {
      calories += 380;
      carbs += 32;
      protein += 18;
      fat += 20;
      category = 'پروتئین';
    }

    // منابع پروتئینی
    if (q.includes('مرغ') || q.includes('جوجه') || q.includes('فیله')) {
      calories += 180;
      protein += 30;
      fat += 5;
      if (category !== 'غذاهای ایرانی') category = 'پروتئین';
    } else if (q.includes('گوشت') || q.includes('کباب') || q.includes('کوبیده') || q.includes('ماهیچه')) {
      calories += 240;
      protein += 24;
      fat += 16;
      if (category !== 'غذاهای ایرانی') category = 'غذاهای ایرانی';
    } else if (q.includes('ماهی') || q.includes('تن') || q.includes('سالمون') || q.includes('میگو')) {
      calories += 190;
      protein += 26;
      fat += 9;
      category = 'پروتئین';
    } else if (q.includes('تخم مرغ') || q.includes('نیمرو') || q.includes('املت')) {
      calories += 120;
      protein += 9;
      fat += 9;
      carbs += 2;
      category = 'پروتئین';
    } else if (q.includes('عدس') || q.includes('لوبیا') || q.includes('نخود') || q.includes('قورمه') || q.includes('قیمه')) {
      calories += 150;
      carbs += 16;
      protein += 9;
      fat += 6;
      category = 'غذاهای ایرانی';
    }

    // منابع چربی، لبنیات و سس‌ها
    if (q.includes('پنیر') || q.includes('موزارلا') || q.includes('گودا')) {
      calories += 90;
      protein += 6;
      fat += 7;
      carbs += 1;
    }
    if (q.includes('خامه') || q.includes('کره') || q.includes('مایونز') || q.includes('روغن')) {
      calories += 110;
      fat += 12;
    }
    if (q.includes('ماست') || q.includes('شیر') || q.includes('دوغ')) {
      calories += 75;
      carbs += 7;
      protein += 5;
      fat += 3;
      category = 'لبنیات';
    }
    if (q.includes('گردو') || q.includes('بادام') || q.includes('پسته') || q.includes('کره بادام')) {
      calories += 110;
      carbs += 3;
      protein += 3;
      fat += 10;
      category = 'چربی و مغزها';
    }

    // میوه و قند
    if (q.includes('موز') || q.includes('سیب') || q.includes('خرما') || q.includes('عسل') || q.includes('شکر') || q.includes('شکلات')) {
      calories += 90;
      carbs += 22;
      if (category !== 'غذاهای ایرانی') category = 'میوه و سبزیجات';
    }

    // حداقل مقدار پیش‌فرض اگر هیچ کلمه کلیدی پیدا نشد
    if (calories === 0) {
      calories = 200;
      carbs = 25;
      protein = 8;
      fat = 7;
    }

    return {
      name: query,
      category,
      unit: unitDesc,
      unitWeight: 100,
      calories: Math.round(calories * multiplier),
      carbs: Math.round(carbs * multiplier * 10) / 10,
      protein: Math.round(protein * multiplier * 10) / 10,
      fat: Math.round(fat * multiplier * 10) / 10,
      description: 'محاسبه شده توسط موتور هوشمند ارزش غذایی (بدون نیاز به اینترنت و بدون API Key)',
      source: 'smart_local'
    };
  }

  guessCategory(text) {
    const t = text.toLowerCase();
    if (t.includes('نان') || t.includes('برنج') || t.includes('ماکارونی') || t.includes('جو')) return 'نان و غلات';
    if (t.includes('مرغ') || t.includes('گوشت') || t.includes('ماهی') || t.includes('تخم مرغ')) return 'پروتئین';
    if (t.includes('شیر') || t.includes('ماست') || t.includes('پنیر')) return 'لبنیات';
    if (t.includes('سیب') || t.includes('موز') || t.includes('سالاد') || t.includes('میوه')) return 'میوه و سبزیجات';
    if (t.includes('روغن') || t.includes('گردو') || t.includes('بادام')) return 'چربی و مغزها';
    return 'غذاهای ایرانی';
  }

  /**
   * ارتباط با Gemini REST API (در صورت داشتن کلید)
   */
  async callGeminiAPI(foodQuery, apiKey) {
    const prompt = `
تو یک متخصص تغذیه هستی. غذای زیر را برآورد کن: "${foodQuery}".
اگر غذا ایرانی است با استانداردهای غذایی مرسوم ایران بسنج.
خروجی فقط یک شیء JSON با ساختار زیر باشد:
{
  "name": "نام غذا به فارسی",
  "category": "یکی از: غذاهای ایرانی یا نان و غلات یا پروتئین یا لبنیات یا میوه و سبزیجات یا چربی و مغزها",
  "unit": "واحد و سهم (مثلاً یک پرس یا یک بشقاب یا ۱۰۰ گرم)",
  "unitWeight": 100,
  "calories": 450,
  "carbs": 45.0,
  "protein": 28.0,
  "fat": 15.0,
  "description": "توضیح کوتاه در یک جمله"
}
`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
      throw new Error('Gemini API Error');
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json/, '').replace(/```$/, '').trim();
    else if (rawText.startsWith('```')) rawText = rawText.replace(/^```/, '').replace(/```$/, '').trim();

    const parsed = JSON.parse(rawText);
    return {
      name: parsed.name || foodQuery,
      category: parsed.category || 'غذاهای ایرانی',
      unit: parsed.unit || '۱۰۰ گرم',
      unitWeight: Number(parsed.unitWeight) || 100,
      calories: Math.round(Number(parsed.calories) || 0),
      carbs: Math.round((Number(parsed.carbs) || 0) * 10) / 10,
      protein: Math.round((Number(parsed.protein) || 0) * 10) / 10,
      fat: Math.round((Number(parsed.fat) || 0) * 10) / 10,
      description: parsed.description || '',
      source: 'gemini'
    };
  }
}

export const gemini = new NutritionAssistant();
