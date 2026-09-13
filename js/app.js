/**
 * HealthPal - Main Application Logic (Revamped 2.0)
 * سیستم پیشرفته انتخاب سهم و گرم غذا، گیج شعاعی کالری و دیتابیس لوکال
 */

import { db } from './db.js';
import { DEFAULT_FOODS, FOOD_CATEGORIES } from './food-database.js';
import { googleFit } from './google-fit.js';
import { gemini } from './gemini.js';

class HealthApp {
  constructor() {
    this.currentDate = this.getTodayDateString();
    this.profile = null;
    this.allFoods = [...DEFAULT_FOODS];
    this.currentMeals = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: []
    };
    this.currentExercises = [];
    this.currentWater = { glasses: 0, ml: 0 };
    
    // Portion Picker State
    this.pickerFood = null;
    this.pickerMode = 'serving'; // 'serving' | 'grams'
    this.pickerAmount = 1;
    this.pickerMeal = 'breakfast';

    this.targetMealForModal = 'breakfast';
    this.deferredPrompt = null;
  }

  async init() {
    this.setupPWA();
    await this.loadProfile();
    await this.loadCustomFoods();
    this.bindEvents();
    this.bindPortionPickerEvents();
    await this.loadDateData(this.currentDate);
    await this.loadWeightHistory();
    await gemini.init();

    const storedGeminiKey = await gemini.getApiKey();
    if (storedGeminiKey) {
      const geminiInput = document.getElementById('input-gemini-api-key');
      if (geminiInput) geminiInput.value = storedGeminiKey;
    }
  }

  // --- Helper: Date Formatting ---
  getTodayDateString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  formatPersianDate(dateStr) {
    try {
      const parts = dateStr.split('-');
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const formatter = new Intl.DateTimeFormat('fa-IR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      return formatter.format(d);
    } catch {
      return dateStr;
    }
  }

  // --- PWA Service Worker & Install Prompt ---
  setupPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
          .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
      });
    }

    const btnInstall = document.getElementById('btn-install-pwa');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (btnInstall) {
        btnInstall.style.display = 'inline-flex';
      }
    });

    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          console.log('[PWA] Install prompt outcome:', outcome);
          this.deferredPrompt = null;
          btnInstall.style.display = 'none';
        }
      });
    }
  }

  // --- Profile & BMR/TDEE Calculations ---
  async loadProfile() {
    this.profile = await db.getProfile();
    this.populateProfileForm();
    this.updateDashboardHeader();
  }

  populateProfileForm() {
    if (!this.profile) return;
    document.getElementById('prof-name').value = this.profile.name || '';
    document.getElementById('prof-gender').value = this.profile.gender || 'male';
    document.getElementById('prof-age').value = this.profile.age || 28;
    document.getElementById('prof-height').value = this.profile.height || 175;
    document.getElementById('prof-weight').value = this.profile.weight || 75;
    document.getElementById('prof-target-weight').value = this.profile.targetWeight || 70;
    document.getElementById('prof-activity').value = this.profile.activityLevel || 'moderate';
    document.getElementById('prof-goal').value = this.profile.goal || 'lose';
    document.getElementById('prof-calorie-target').value = this.profile.dailyCalorieTarget || 2000;
    document.getElementById('prof-water-target').value = this.profile.waterTargetMl || 2500;
    document.getElementById('prof-ratio-carbs').value = this.profile.carbsRatio || 50;
    document.getElementById('prof-ratio-protein').value = this.profile.proteinRatio || 25;
    document.getElementById('prof-ratio-fat').value = this.profile.fatRatio || 25;

    // Weight tab stats
    document.getElementById('stat-current-weight').textContent = this.profile.weight || '--';
    document.getElementById('stat-target-weight').textContent = this.profile.targetWeight || '--';
    
    // BMI
    if (this.profile.height && this.profile.weight) {
      const hM = this.profile.height / 100;
      const bmi = (this.profile.weight / (hM * hM)).toFixed(1);
      document.getElementById('stat-bmi-val').textContent = bmi;
    }
  }

  calculateTDEE() {
    const gender = document.getElementById('prof-gender').value;
    const age = Number(document.getElementById('prof-age').value);
    const height = Number(document.getElementById('prof-height').value);
    const weight = Number(document.getElementById('prof-weight').value);
    const activity = document.getElementById('prof-activity').value;
    const goal = document.getElementById('prof-goal').value;

    if (!age || !height || !weight) {
      this.showToast('لطفاً سن، قد و وزن را وارد کنید', 'error');
      return;
    }

    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (gender === 'male' ? 5 : -161);

    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };

    const multiplier = activityMultipliers[activity] || 1.375;
    let tdee = Math.round(bmr * multiplier);

    if (goal === 'lose') {
      tdee -= 450;
      tdee = Math.max(gender === 'male' ? 1500 : 1200, tdee);
    } else if (goal === 'gain') {
      tdee += 400;
    }

    document.getElementById('prof-calorie-target').value = tdee;
    
    const suggestedWater = Math.round((weight * 35) / 100) * 100;
    document.getElementById('prof-water-target').value = Math.max(2000, suggestedWater);

    this.showToast(`کالری هدف محاسبه شد: ${tdee} کیلوکالری`, 'success');
  }

  updateDashboardHeader() {
    if (!this.profile) return;
    const goalLabels = {
      lose: 'هدف: کاهش وزن',
      maintain: 'هدف: تثبیت وزن',
      gain: 'هدف: افزایش وزن'
    };
    document.getElementById('tdee-mode-label').textContent = goalLabels[this.profile.goal] || 'مدیریت وزن';
    document.getElementById('dash-cal-target').textContent = this.profile.dailyCalorieTarget || 2000;
  }

  // --- Foods Management ---
  async loadCustomFoods() {
    const custom = await db.getAllCustomFoods();
    this.allFoods = [...DEFAULT_FOODS, ...custom];
    this.renderFoodDiaryList(this.allFoods);
  }

  renderFoodDiaryList(foods) {
    const container = document.getElementById('diary-foods-list');
    if (!container) return;

    if (foods.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 24px;">غذایی یافت نشد.</div>';
      return;
    }

    container.innerHTML = foods.map(food => `
      <div class="food-result-card" data-id="${food.id}">
        <div>
          <div style="font-weight: 800; color: #fff; font-size: 0.96rem;">
            ${food.name} 
            ${food.isCustom ? '<span style="font-size:0.68rem; color:var(--emerald-light); border:1px solid var(--emerald); padding:1px 5px; border-radius:4px; margin-right:4px;">سفارشی</span>' : ''}
          </div>
          <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px;">
            ${food.unit} • C:${food.carbs}g • P:${food.protein}g • F:${food.fat}g
          </div>
        </div>
        <div style="text-align: left; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <div style="font-weight: 900; color: var(--emerald-light); font-size: 1rem;">${food.calories} <small style="font-size:0.7rem;">kcal</small></div>
          <button class="btn btn-secondary btn-diary-pick-portion" data-id="${food.id}" style="padding: 4px 10px; font-size: 0.74rem;">
            + تعیین مقدار
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.food-result-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const food = this.allFoods.find(f => f.id == id);
        if (food) {
          this.openPortionPicker(food, 'lunch');
        }
      });
    });
  }

  // --- Loading Daily Data ---
  async loadDateData(dateStr) {
    this.currentDate = dateStr;
    
    const isToday = dateStr === this.getTodayDateString();
    document.getElementById('label-current-date').textContent = this.formatPersianDate(dateStr);
    document.getElementById('badge-is-today').style.display = isToday ? 'inline-block' : 'none';

    // ۱. دریافت لاگ غذاها
    const foodLogs = await db.getFoodLogsByDate(dateStr);
    this.currentMeals = {
      breakfast: foodLogs.filter(f => f.mealType === 'breakfast'),
      lunch: foodLogs.filter(f => f.mealType === 'lunch'),
      dinner: foodLogs.filter(f => f.mealType === 'dinner'),
      snack: foodLogs.filter(f => f.mealType === 'snack')
    };
    this.renderMealSections();

    // ۲. دریافت لاگ ورزش‌ها
    this.currentExercises = await db.getExerciseLogsByDate(dateStr);
    this.renderExerciseSection();

    // ۳. دریافت لاگ آب
    this.currentWater = await db.getWaterLog(dateStr);
    this.renderWaterSection();

    // ۴. به‌روزرسانی گیج شعاعی و ماکروها
    this.updateDailyCalculations();
  }

  renderMealSections() {
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    
    mealTypes.forEach(meal => {
      const items = this.currentMeals[meal] || [];
      const listContainer = document.getElementById(`meal-items-${meal}`);
      const calBadge = document.getElementById(`meal-cal-${meal}`);

      const totalMealCals = items.reduce((sum, item) => sum + item.calories, 0);
      calBadge.textContent = `${totalMealCals} kcal`;

      if (items.length === 0) {
        listContainer.innerHTML = `
          <div style="padding: 12px 0; font-size: 0.8rem; color: var(--text-sub); text-align: center;">
            هنوز غذایی در این وعده ثبت نشده است.
          </div>
        `;
      } else {
        listContainer.innerHTML = items.map(item => `
          <div class="meal-food-row">
            <div class="food-row-info">
              <span class="food-row-name">${item.name}</span>
              <div class="food-row-chips">
                <span class="chip-tag">${item.amountDesc || `${item.amount} ${item.unit}`}</span>
                <span class="chip-tag c">C:${item.carbs}g</span>
                <span class="chip-tag p">P:${item.protein}g</span>
                <span class="chip-tag f">F:${item.fat}g</span>
              </div>
            </div>
            <div class="food-row-actions">
              <span class="food-row-cal">${item.calories} kcal</span>
              <button class="btn-del-food" data-id="${item.id}" title="حذف">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `).join('');

        listContainer.querySelectorAll('.btn-del-food').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            await db.deleteFoodLog(id);
            this.showToast('آیتم غذایی حذف شد');
            await this.loadDateData(this.currentDate);
          });
        });
      }
    });
  }

  renderExerciseSection() {
    const container = document.getElementById('exercises-list-today');
    const totalBurned = this.currentExercises.reduce((sum, ex) => sum + ex.caloriesBurned, 0);
    const totalSteps = this.currentExercises.reduce((sum, ex) => sum + (ex.steps || 0), 0);

    document.getElementById('dash-steps-count').textContent = totalSteps.toLocaleString('fa-IR');
    document.getElementById('dash-steps-cals').textContent = totalBurned;

    if (!container) return;

    if (this.currentExercises.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-sub); padding: 24px; font-size: 0.85rem;">
          امروز ورزشی ثبت نشده است.
        </div>
      `;
      return;
    }

    container.innerHTML = this.currentExercises.map(ex => `
      <div class="meal-food-row">
        <div class="food-row-info">
          <span class="food-row-name">${ex.name}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${ex.durationMin} دقیقه ${ex.steps ? `• ${ex.steps.toLocaleString('fa-IR')} گام` : ''}</span>
        </div>
        <div class="food-row-actions">
          <span class="food-row-cal" style="color: var(--exercise);">${ex.caloriesBurned} kcal</span>
          <button class="btn-del-food btn-del-ex" data-id="${ex.id}" title="حذف">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-del-ex').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await db.deleteExerciseLog(id);
        this.showToast('ورزش حذف شد');
        await this.loadDateData(this.currentDate);
      });
    });
  }

  renderWaterSection() {
    const container = document.getElementById('water-cups-container');
    const label = document.getElementById('water-stat-label');
    const targetMl = this.profile?.waterTargetMl || 2500;
    const totalGlasses = Math.max(8, Math.ceil(targetMl / 250));
    const currentGlasses = this.currentWater.glasses || 0;
    const currentMl = currentGlasses * 250;

    label.textContent = `${currentMl} / ${targetMl} میلی‌لیتر (${currentGlasses} لیوان)`;

    let cupsHtml = '';
    for (let i = 1; i <= totalGlasses; i++) {
      const isFilled = i <= currentGlasses;
      cupsHtml += `<div class="water-cup ${isFilled ? 'filled' : ''}" data-index="${i}" title="${i * 250} ml"></div>`;
    }
    container.innerHTML = cupsHtml;

    container.querySelectorAll('.water-cup').forEach(cup => {
      cup.addEventListener('click', async () => {
        const idx = Number(cup.getAttribute('data-index'));
        let newGlasses = idx;
        if (idx === currentGlasses) {
          newGlasses = idx - 1;
        }
        await this.updateWaterIntake(newGlasses);
      });
    });
  }

  async updateWaterIntake(glasses) {
    glasses = Math.max(0, glasses);
    this.currentWater = {
      date: this.currentDate,
      glasses,
      ml: glasses * 250,
      targetMl: this.profile?.waterTargetMl || 2500
    };
    await db.saveWaterLog(this.currentWater);
    this.renderWaterSection();
  }

  // --- Daily Calorie Equation & Radial Ring Calculation ---
  updateDailyCalculations() {
    const targetCal = this.profile?.dailyCalorieTarget || 2000;
    
    let totalFoodCal = 0;
    let totalCarbs = 0;
    let totalProtein = 0;
    let totalFat = 0;

    Object.values(this.currentMeals).forEach(mealList => {
      mealList.forEach(item => {
        totalFoodCal += item.calories || 0;
        totalCarbs += item.carbs || 0;
        totalProtein += item.protein || 0;
        totalFat += item.fat || 0;
      });
    });

    const totalExerciseCal = this.currentExercises.reduce((sum, ex) => sum + (ex.caloriesBurned || 0), 0);
    const remainingCal = targetCal - totalFoodCal + totalExerciseCal;

    // آپدیت مقادیر گیج
    document.getElementById('dash-cal-target').textContent = targetCal;
    document.getElementById('dash-cal-food').textContent = totalFoodCal;
    document.getElementById('dash-cal-exercise').textContent = totalExerciseCal;
    
    const remEl = document.getElementById('dash-cal-remaining');
    remEl.textContent = remainingCal;

    const statusEl = document.getElementById('dash-status-text');
    const circle = document.getElementById('radial-progress-circle');

    // محیط دایره = 2 * PI * 48 ≈ 301.6
    const circumference = 301.6;
    const progressPercent = Math.min(100, Math.max(0, Math.round((totalFoodCal / targetCal) * 100)));
    const offset = circumference - (circumference * (progressPercent / 100));
    circle.style.strokeDashoffset = offset;

    if (remainingCal < 0) {
      remEl.style.color = 'var(--protein)';
      circle.style.stroke = 'var(--protein)';
      statusEl.textContent = 'بیش از حد مجاز';
      statusEl.style.color = 'var(--protein)';
    } else {
      remEl.style.color = '#fff';
      circle.style.stroke = 'var(--emerald)';
      statusEl.textContent = 'در مسیر هدف';
      statusEl.style.color = 'var(--emerald-light)';
    }

    // اهداف ماکروها
    const carbsTargetGrams = Math.round((targetCal * ((this.profile?.carbsRatio || 50) / 100)) / 4);
    const proteinTargetGrams = Math.round((targetCal * ((this.profile?.proteinRatio || 25) / 100)) / 4);
    const fatTargetGrams = Math.round((targetCal * ((this.profile?.fatRatio || 25) / 100)) / 9);

    // درصد کپسول‌ها
    const cPercent = Math.min(100, Math.round((totalCarbs / carbsTargetGrams) * 100)) || 0;
    const pPercent = Math.min(100, Math.round((totalProtein / proteinTargetGrams) * 100)) || 0;
    const fPercent = Math.min(100, Math.round((totalFat / fatTargetGrams) * 100)) || 0;

    document.getElementById('dash-cur-carbs').textContent = Math.round(totalCarbs);
    document.getElementById('dash-target-carbs').textContent = carbsTargetGrams;
    document.getElementById('dash-fill-carbs').style.width = `${cPercent}%`;
    document.getElementById('macro-percent-carbs').textContent = `${cPercent}%`;

    document.getElementById('dash-cur-protein').textContent = Math.round(totalProtein);
    document.getElementById('dash-target-protein').textContent = proteinTargetGrams;
    document.getElementById('dash-fill-protein').style.width = `${pPercent}%`;
    document.getElementById('macro-percent-protein').textContent = `${pPercent}%`;

    document.getElementById('dash-cur-fat').textContent = Math.round(totalFat);
    document.getElementById('dash-target-fat').textContent = fatTargetGrams;
    document.getElementById('dash-fill-fat').style.width = `${fPercent}%`;
    document.getElementById('macro-percent-fat').textContent = `${fPercent}%`;
  }

  // --- Weight History & Chart Rendering ---
  async loadWeightHistory() {
    const logs = await db.getAllWeightLogs();
    const listContainer = document.getElementById('weight-history-list');
    
    if (logs.length === 0) {
      listContainer.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 12px;">هنوز وزنی ثبت نشده است.</div>';
    } else {
      listContainer.innerHTML = logs.slice().reverse().map(item => `
        <div class="meal-food-row">
          <div>
            <span style="font-weight: 800; color: #fff;">${item.weight} kg</span>
            <div style="font-size: 0.74rem; color: var(--text-muted);">${this.formatPersianDate(item.date)} ${item.notes ? `• ${item.notes}` : ''}</div>
          </div>
          <button class="btn-del-food btn-del-weight" data-id="${item.id}" title="حذف">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `).join('');

      listContainer.querySelectorAll('.btn-del-weight').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await db.deleteWeightLog(id);
          this.showToast('رکورد وزن حذف شد');
          await this.loadWeightHistory();
        });
      });
    }

    this.renderWeightChart(logs);
  }

  renderWeightChart(logs) {
    const svg = document.getElementById('weight-chart-svg');
    if (!svg) return;

    if (logs.length < 2) {
      svg.innerHTML = `
        <text x="250" y="90" text-anchor="middle" fill="#64748b" font-size="14">
          برای نمایش نمودار حداقل دو رکورد وزن ثبت کنید
        </text>
      `;
      return;
    }

    const width = 500;
    const height = 180;
    const padding = 35;

    const weights = logs.map(l => l.weight);
    const minW = Math.floor(Math.min(...weights) - 1);
    const maxW = Math.ceil(Math.max(...weights) + 1);

    const getX = (index) => padding + (index / (logs.length - 1)) * (width - 2 * padding);
    const getY = (val) => height - padding - ((val - minW) / (maxW - minW)) * (height - 2 * padding);

    const points = logs.map((l, i) => `${getX(i)},${getY(l.weight)}`).join(' ');

    let svgContent = `
      <defs>
        <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      
      <line x1="${padding}" y1="${getY(minW)}" x2="${width - padding}" y2="${getY(minW)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${getY((minW + maxW)/2)}" x2="${width - padding}" y2="${getY((minW + maxW)/2)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${getY(maxW)}" x2="${width - padding}" y2="${getY(maxW)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4"/>
      
      <polygon points="${getX(0)},${height - padding} ${points} ${getX(logs.length - 1)},${height - padding}" fill="url(#chartGrad)" />
      <polyline fill="none" stroke="#10b981" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="${points}"/>
    `;

    logs.forEach((l, i) => {
      const x = getX(i);
      const y = getY(l.weight);
      svgContent += `
        <circle cx="${x}" cy="${y}" r="4.5" fill="#10b981" stroke="#080c15" stroke-width="2"/>
        <text x="${x}" y="${y - 8}" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold">${l.weight}</text>
      `;
    });

    svg.innerHTML = svgContent;
  }

  // =========================================================================
  // PORTION & AMOUNT PICKER MODAL (Requirement #2 Solution)
  // =========================================================================

  openPortionPicker(food, defaultMeal = 'breakfast') {
    this.pickerFood = food;
    this.pickerMeal = defaultMeal;
    this.pickerMode = 'serving';
    this.pickerAmount = 1;

    // تنظیم اطلاعات غذا
    document.getElementById('picker-food-title').textContent = food.name;
    document.getElementById('picker-food-meta').textContent = `${food.category} • سهم پایه: ${food.unit} (${food.unitWeight || 100} گرم)`;

    // فعال‌سازی تب سهم
    document.getElementById('picker-tab-serving').classList.add('active');
    document.getElementById('picker-tab-grams').classList.remove('active');

    // مقدار اولیه
    document.getElementById('picker-amount-input').value = 1;
    document.getElementById('picker-amount-unit-label').textContent = 'سهم';

    // انتخاب دکمه وعده غذایی
    document.querySelectorAll('.meal-pill-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-meal') === defaultMeal);
    });

    this.renderQuickChips();
    this.recalculatePickerNutrients();
    this.openModal('modal-portion-picker');
  }

  renderQuickChips() {
    const container = document.getElementById('picker-quick-chips');
    if (!container) return;

    if (this.pickerMode === 'serving') {
      const chips = [0.5, 1, 1.5, 2, 3];
      container.innerHTML = chips.map(c => `
        <button class="quick-chip-btn ${this.pickerAmount === c ? 'active' : ''}" data-val="${c}">
          ${c} سهم
        </button>
      `).join('');
    } else {
      const chips = [50, 100, 150, 200, 250, 300];
      container.innerHTML = chips.map(g => `
        <button class="quick-chip-btn ${this.pickerAmount === g ? 'active' : ''}" data-val="${g}">
          ${g} گرم
        </button>
      `).join('');
    }

    container.querySelectorAll('.quick-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.getAttribute('data-val'));
        this.pickerAmount = val;
        document.getElementById('picker-amount-input').value = val;
        this.renderQuickChips();
        this.recalculatePickerNutrients();
      });
    });
  }

  recalculatePickerNutrients() {
    if (!this.pickerFood) return;
    const f = this.pickerFood;
    const baseWeight = f.unitWeight || 100;

    let multiplier = 1;
    if (this.pickerMode === 'serving') {
      multiplier = this.pickerAmount;
    } else {
      multiplier = this.pickerAmount / baseWeight;
    }

    const computedCals = Math.round(f.calories * multiplier);
    const computedCarbs = Math.round(f.carbs * multiplier * 10) / 10;
    const computedProtein = Math.round(f.protein * multiplier * 10) / 10;
    const computedFat = Math.round(f.fat * multiplier * 10) / 10;

    document.getElementById('picker-calc-cal').textContent = `${computedCals} kcal`;
    document.getElementById('picker-calc-carbs').textContent = `${computedCarbs}g`;
    document.getElementById('picker-calc-protein').textContent = `${computedProtein}g`;
    document.getElementById('picker-calc-fat').textContent = `${computedFat}g`;
  }

  bindPortionPickerEvents() {
    // سوئیچ بین حالت سهم و گرم
    const tabServing = document.getElementById('picker-tab-serving');
    const tabGrams = document.getElementById('picker-tab-grams');
    const inputVal = document.getElementById('picker-amount-input');
    const unitLabel = document.getElementById('picker-amount-unit-label');

    tabServing.addEventListener('click', () => {
      this.pickerMode = 'serving';
      tabServing.classList.add('active');
      tabGrams.classList.remove('active');
      this.pickerAmount = 1;
      inputVal.value = 1;
      inputVal.step = 0.5;
      unitLabel.textContent = 'سهم';
      this.renderQuickChips();
      this.recalculatePickerNutrients();
    });

    tabGrams.addEventListener('click', () => {
      this.pickerMode = 'grams';
      tabGrams.classList.add('active');
      tabServing.classList.remove('active');
      const baseWeight = this.pickerFood?.unitWeight || 100;
      this.pickerAmount = baseWeight;
      inputVal.value = baseWeight;
      inputVal.step = 25;
      unitLabel.textContent = 'گرم';
      this.renderQuickChips();
      this.recalculatePickerNutrients();
    });

    // استپر مثبت و منفی
    document.getElementById('btn-stepper-minus').addEventListener('click', () => {
      if (this.pickerMode === 'serving') {
        this.pickerAmount = Math.max(0.5, Math.round((this.pickerAmount - 0.5) * 10) / 10);
      } else {
        this.pickerAmount = Math.max(10, this.pickerAmount - 25);
      }
      inputVal.value = this.pickerAmount;
      this.renderQuickChips();
      this.recalculatePickerNutrients();
    });

    document.getElementById('btn-stepper-plus').addEventListener('click', () => {
      if (this.pickerMode === 'serving') {
        this.pickerAmount = Math.round((this.pickerAmount + 0.5) * 10) / 10;
      } else {
        this.pickerAmount = this.pickerAmount + 25;
      }
      inputVal.value = this.pickerAmount;
      this.renderQuickChips();
      this.recalculatePickerNutrients();
    });

    // تغییر مستقیم در اینپوت
    inputVal.addEventListener('input', () => {
      const val = parseFloat(inputVal.value) || 1;
      this.pickerAmount = val;
      this.recalculatePickerNutrients();
    });

    // انتخاب وعده غذایی
    document.querySelectorAll('.meal-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.meal-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.pickerMeal = btn.getAttribute('data-meal');
      });
    });

    // دکمه تایید نهایی و ثبت در دیتابیس
    document.getElementById('btn-picker-confirm').addEventListener('click', async () => {
      if (!this.pickerFood) return;
      const f = this.pickerFood;
      const baseWeight = f.unitWeight || 100;

      let multiplier = 1;
      let amountDescription = '';

      if (this.pickerMode === 'serving') {
        multiplier = this.pickerAmount;
        amountDescription = `${this.pickerAmount} سهم (${f.unit})`;
      } else {
        multiplier = this.pickerAmount / baseWeight;
        amountDescription = `${this.pickerAmount} گرم`;
      }

      // اگر غذا از هوش مصنوعی آمده بود، در بانک غذاهای سفارشی ذخیره شود
      if (f.isAiGenerated && !f.id) {
        const customId = await db.addCustomFood({
          name: f.name,
          category: f.category,
          unit: f.unit,
          unitWeight: f.unitWeight || 100,
          calories: f.calories,
          protein: f.protein,
          carbs: f.carbs,
          fat: f.fat,
          description: f.description
        });
        f.id = customId;
        await this.loadCustomFoods();
      }

      const logItem = {
        date: this.currentDate,
        mealType: this.pickerMeal,
        foodId: f.id,
        name: f.name,
        amount: this.pickerAmount,
        unit: this.pickerMode === 'serving' ? f.unit : 'گرم',
        amountDesc: amountDescription,
        calories: Math.round(f.calories * multiplier),
        carbs: Math.round(f.carbs * multiplier * 10) / 10,
        protein: Math.round(f.protein * multiplier * 10) / 10,
        fat: Math.round(f.fat * multiplier * 10) / 10
      };

      await db.addFoodLog(logItem);
      this.closeModal('modal-portion-picker');
      this.closeModal('modal-add-food');
      this.showToast(`✨ ${f.name} (${amountDescription}) ثبت شد`);
      await this.loadDateData(this.currentDate);
    });
  }

  // --- Modals Management ---
  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
  }

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
  }

  openAddFoodModal(mealType = 'breakfast') {
    this.targetMealForModal = mealType;
    const mealNamesFa = {
      breakfast: 'صبحانه',
      lunch: 'ناهار',
      dinner: 'شام',
      snack: 'میان‌وعده'
    };
    document.getElementById('modal-meal-name-label').textContent = mealNamesFa[mealType] || 'وعده';
    
    this.renderModalCategories();
    this.renderModalFoodResults(this.allFoods);
    this.openModal('modal-add-food');
  }

  renderModalCategories() {
    const container = document.getElementById('modal-food-categories');
    if (!container) return;

    container.innerHTML = FOOD_CATEGORIES.map((cat, i) => `
      <button class="cat-pill ${i === 0 ? 'active' : ''}" data-cat="${cat}">${cat}</button>
    `).join('');

    container.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.getAttribute('data-cat');
        const filtered = cat === 'همه' 
          ? this.allFoods 
          : this.allFoods.filter(f => f.category === cat);
        this.renderModalFoodResults(filtered);
      });
    });
  }

  renderModalFoodResults(foods) {
    const container = document.getElementById('modal-food-results');
    if (!container) return;

    if (foods.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 18px;">غذایی در این دسته یافت نشد.</div>';
      return;
    }

    container.innerHTML = foods.slice(0, 35).map(f => `
      <div class="food-result-card modal-food-item" data-id="${f.id}">
        <div>
          <div style="font-weight: 800; color: #fff;">${f.name}</div>
          <div style="font-size: 0.76rem; color: var(--text-muted);">${f.unit} • ${f.calories} kcal</div>
        </div>
        <button class="btn btn-secondary" style="padding: 5px 12px; font-size: 0.78rem;">تعیین مقدار</button>
      </div>
    `).join('');

    container.querySelectorAll('.modal-food-item').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const food = this.allFoods.find(f => f.id == id);
        if (food) {
          this.openPortionPicker(food, this.targetMealForModal);
        }
      });
    });
  }

  // --- Toast Notifications ---
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // --- Main Event Bindings ---
  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));

        btn.classList.add('active');
        const viewId = btn.getAttribute('data-view');
        const viewEl = document.getElementById(viewId);
        if (viewEl) viewEl.classList.add('active');
      });
    });

    // Date Navigation
    document.getElementById('btn-prev-day').addEventListener('click', () => {
      const d = new Date(this.currentDate);
      d.setDate(d.getDate() - 1);
      this.loadDateData(d.toISOString().split('T')[0]);
    });

    document.getElementById('btn-next-day').addEventListener('click', () => {
      const d = new Date(this.currentDate);
      d.setDate(d.getDate() + 1);
      this.loadDateData(d.toISOString().split('T')[0]);
    });

    // Quick Action Buttons
    document.getElementById('quick-action-food').addEventListener('click', () => {
      this.openAddFoodModal('lunch');
    });

    document.getElementById('quick-action-exercise').addEventListener('click', () => {
      this.openModal('modal-add-exercise');
    });

    document.getElementById('quick-action-water').addEventListener('click', async () => {
      await this.updateWaterIntake((this.currentWater.glasses || 0) + 1);
      this.showToast('+۱ لیوان آب ثبت شد (۲۵۰ میلی‌لیتر)');
    });

    document.getElementById('quick-action-weight').addEventListener('click', () => {
      document.getElementById('input-weight-date').value = this.currentDate;
      this.openModal('modal-add-weight');
    });

    // Meal header '+' buttons
    document.querySelectorAll('.btn-add-meal-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const meal = btn.getAttribute('data-meal');
        this.openAddFoodModal(meal);
      });
    });

    // Modal Close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });

    // Modal food search live
    document.getElementById('food-modal-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = this.allFoods.filter(f => 
        f.name.toLowerCase().includes(q) || (f.nameEn && f.nameEn.toLowerCase().includes(q))
      );
      this.renderModalFoodResults(filtered);
    });

    // Diary search live
    document.getElementById('diary-search-input').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = this.allFoods.filter(f => 
        f.name.toLowerCase().includes(q) || (f.nameEn && f.nameEn.toLowerCase().includes(q))
      );
      this.renderFoodDiaryList(filtered);
    });

    // Create Custom Food Modal
    document.getElementById('btn-open-create-food').addEventListener('click', () => {
      this.openModal('modal-create-food');
    });

    document.getElementById('form-create-food').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newFood = {
        name: document.getElementById('new-food-name').value.trim(),
        category: document.getElementById('new-food-cat').value,
        unit: document.getElementById('new-food-unit').value.trim(),
        unitWeight: Number(document.getElementById('new-food-unit-weight').value) || 100,
        calories: Number(document.getElementById('new-food-calories').value),
        protein: Number(document.getElementById('new-food-protein').value),
        carbs: Number(document.getElementById('new-food-carbs').value),
        fat: Number(document.getElementById('new-food-fat').value)
      };

      await db.addCustomFood(newFood);
      this.closeModal('modal-create-food');
      document.getElementById('form-create-food').reset();
      this.showToast('غذای جدید در بانک اطلاعاتی ذخیره شد');
      await this.loadCustomFoods();
    });

    // Add Exercise
    document.getElementById('btn-open-add-exercise').addEventListener('click', () => {
      this.openModal('modal-add-exercise');
    });

    document.getElementById('form-add-exercise').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ex = {
        date: this.currentDate,
        type: document.getElementById('ex-type').value,
        name: document.getElementById('ex-name').value.trim(),
        durationMin: Number(document.getElementById('ex-duration').value),
        caloriesBurned: Number(document.getElementById('ex-calories').value),
        steps: Number(document.getElementById('ex-steps').value) || 0
      };

      await db.addExerciseLog(ex);
      this.closeModal('modal-add-exercise');
      document.getElementById('form-add-exercise').reset();
      this.showToast('ورزش با موفقیت ثبت شد');
      await this.loadDateData(this.currentDate);
    });

    // Add Weight
    document.getElementById('btn-open-add-weight').addEventListener('click', () => {
      document.getElementById('input-weight-date').value = this.currentDate;
      this.openModal('modal-add-weight');
    });

    document.getElementById('form-add-weight').addEventListener('submit', async (e) => {
      e.preventDefault();
      const weightVal = Number(document.getElementById('input-weight-val').value);
      const dateVal = document.getElementById('input-weight-date').value;
      const notes = document.getElementById('input-weight-notes').value.trim();

      await db.addWeightLog({
        date: dateVal,
        weight: weightVal,
        notes
      });

      if (this.profile) {
        this.profile.weight = weightVal;
        await db.saveProfile(this.profile);
        this.populateProfileForm();
      }

      this.closeModal('modal-add-weight');
      document.getElementById('form-add-weight').reset();
      this.showToast('وزن با موفقیت ثبت شد');
      await this.loadWeightHistory();
    });

    // Profile Calculation & Submission
    document.getElementById('btn-calc-tdee').addEventListener('click', () => {
      this.calculateTDEE();
    });

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const updatedProfile = {
        name: document.getElementById('prof-name').value.trim(),
        gender: document.getElementById('prof-gender').value,
        age: Number(document.getElementById('prof-age').value),
        height: Number(document.getElementById('prof-height').value),
        weight: Number(document.getElementById('prof-weight').value),
        targetWeight: Number(document.getElementById('prof-target-weight').value),
        activityLevel: document.getElementById('prof-activity').value,
        goal: document.getElementById('prof-goal').value,
        dailyCalorieTarget: Number(document.getElementById('prof-calorie-target').value),
        waterTargetMl: Number(document.getElementById('prof-water-target').value),
        carbsRatio: Number(document.getElementById('prof-ratio-carbs').value),
        proteinRatio: Number(document.getElementById('prof-ratio-protein').value),
        fatRatio: Number(document.getElementById('prof-ratio-fat').value)
      };

      await db.saveProfile(updatedProfile);
      this.profile = updatedProfile;
      this.updateDashboardHeader();
      this.updateDailyCalculations();
      this.renderWaterSection();
      this.showToast('پروفایل با موفقیت ذخیره شد');
    });

    // --- Live Motion Pedometer Events ---
    const btnStartPed = document.getElementById('btn-start-pedometer');
    const btnStopPed = document.getElementById('btn-stop-pedometer');
    const pedCountEl = document.getElementById('live-pedometer-count');
    const pedCalsEl = document.getElementById('live-pedometer-cals');
    const pedBadge = document.getElementById('pedometer-status-badge');

    if (btnStartPed && btnStopPed) {
      btnStartPed.addEventListener('click', async () => {
        try {
          if (pedCountEl) pedCountEl.textContent = '0';
          if (pedCalsEl) pedCalsEl.textContent = '0';

          await googleFit.startLivePedometer((steps) => {
            if (pedCountEl) pedCountEl.textContent = steps.toLocaleString('fa-IR');
            const cals = googleFit.calculateStepCalories(steps, this.profile?.weight || 70);
            if (pedCalsEl) pedCalsEl.textContent = cals;
          });

          btnStartPed.style.display = 'none';
          btnStopPed.style.display = 'inline-flex';
          if (pedBadge) {
            pedBadge.textContent = '🟢 در حال شمارش گام';
            pedBadge.style.background = 'rgba(16, 185, 129, 0.2)';
            pedBadge.style.color = 'var(--emerald-light)';
          }
          this.showToast('گام‌شمار فعال شد. گوشی را هنگام راه رفتن همراه خود داشته باشید.');
        } catch (err) {
          console.error('Pedometer error:', err);
          this.showToast(err.message || 'عدم امکان دسترسی به حسگر حرکتی', 'error');
        }
      });

      btnStopPed.addEventListener('click', async () => {
        const steps = googleFit.stopLivePedometer();
        btnStartPed.style.display = 'inline-flex';
        btnStopPed.style.display = 'none';
        if (pedBadge) {
          pedBadge.textContent = 'آماده به کار';
          pedBadge.style.background = 'rgba(148, 163, 184, 0.15)';
          pedBadge.style.color = 'var(--text-muted)';
        }

        if (steps > 0) {
          await googleFit.logSteps(steps, this.currentDate, this.profile?.weight || 70);
          this.showToast(`🎉 ${steps.toLocaleString('fa-IR')} گام جدید با موفقیت ثبت شد`);
          await this.loadDateData(this.currentDate);
        } else {
          this.showToast('گامی برای ثبت تشخیص داده نشد');
        }
      });
    }

    // --- Quick Steps Submission (Input + Presets) ---
    const submitStepsHandler = async (stepsCount) => {
      const steps = parseInt(stepsCount) || 0;
      if (steps <= 0) {
        this.showToast('لطفاً تعداد گام معتبری وارد کنید', 'error');
        return;
      }
      await googleFit.logSteps(steps, this.currentDate, this.profile?.weight || 70);
      this.showToast(`✨ ${steps.toLocaleString('fa-IR')} گام ثبت شد`);
      await this.loadDateData(this.currentDate);
    };

    const btnSubmitQuickSteps = document.getElementById('btn-submit-quick-steps');
    const inputQuickSteps = document.getElementById('input-quick-steps');
    if (btnSubmitQuickSteps && inputQuickSteps) {
      btnSubmitQuickSteps.addEventListener('click', async () => {
        const val = inputQuickSteps.value.trim();
        await submitStepsHandler(val);
        inputQuickSteps.value = '';
      });

      inputQuickSteps.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const val = inputQuickSteps.value.trim();
          await submitStepsHandler(val);
          inputQuickSteps.value = '';
        }
      });
    }

    // Activity page chips
    document.querySelectorAll('.btn-act-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        const steps = chip.getAttribute('data-steps');
        await submitStepsHandler(steps);
      });
    });

    // Dashboard chips
    document.querySelectorAll('.btn-dash-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        const steps = chip.getAttribute('data-steps');
        await submitStepsHandler(steps);
      });
    });

    // Dashboard "+ ثبت سریع گام" button
    const btnQuickAddStepsDash = document.getElementById('btn-quick-add-steps-dash');
    if (btnQuickAddStepsDash) {
      btnQuickAddStepsDash.addEventListener('click', () => {
        const actNav = document.querySelector('.nav-item[data-view="view-activity"]');
        if (actNav) actNav.click();
        setTimeout(() => {
          const inp = document.getElementById('input-quick-steps');
          if (inp) inp.focus();
        }, 150);
      });
    }

    // --- Health File Importer (JSON / CSV) ---
    const btnTriggerHealth = document.getElementById('btn-trigger-health-import');
    const inputHealthFile = document.getElementById('input-health-file');

    if (btnTriggerHealth && inputHealthFile) {
      btnTriggerHealth.addEventListener('click', () => {
        inputHealthFile.click();
      });

      inputHealthFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const content = event.target.result;
            const importedLogs = await googleFit.importHealthFile(content, file.name);
            
            for (const item of importedLogs) {
              await db.addExerciseLog(item);
            }

            this.showToast(`✅ ${importedLogs.length} رکورد فعالیت از فایل گزارش سلامت اضافه شد`);
            await this.loadDateData(this.currentDate);
          } catch (err) {
            console.error('Health file import error:', err);
            this.showToast(err.message || 'خطا در بارگذاری فایل سلامت', 'error');
          } finally {
            inputHealthFile.value = '';
          }
        };
        reader.readAsText(file);
      });
    }

    // Backup & Restore
    document.getElementById('btn-export-backup').addEventListener('click', async () => {
      const data = await db.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `healthpal-backup-${this.getTodayDateString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('فایل پشتیبان دانلود شد');
    });

    document.getElementById('btn-trigger-import').addEventListener('click', () => {
      document.getElementById('input-import-file').click();
    });

    document.getElementById('input-import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target.result);
          await db.importAllData(json);
          this.showToast('داده‌ها با موفقیت بازیابی شدند');
          await this.loadProfile();
          await this.loadCustomFoods();
          await this.loadDateData(this.currentDate);
          await this.loadWeightHistory();
        } catch (err) {
          console.error('Import error:', err);
          this.showToast('خطا در فایل پشتیبان', 'error');
        }
      };
      reader.readAsText(file);
    });

    // Gemini AI Events
    document.getElementById('btn-save-gemini-api-key').addEventListener('click', async () => {
      const key = document.getElementById('input-gemini-api-key').value.trim();
      if (!key) {
        this.showToast('لطفاً کلید API را وارد کنید', 'error');
        return;
      }
      await gemini.saveApiKey(key);
      this.showToast('✨ کلید هوش مصنوعی با موفقیت ذخیره شد');
    });

    document.getElementById('btn-diary-ask-gemini').addEventListener('click', () => {
      this.handleGeminiFoodSearch('diary');
    });

    document.getElementById('btn-modal-ask-gemini').addEventListener('click', () => {
      this.handleGeminiFoodSearch('modal');
    });

    document.getElementById('diary-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleGeminiFoodSearch('diary');
      }
    });

    document.getElementById('food-modal-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleGeminiFoodSearch('modal');
      }
    });
  }

  // --- Gemini & Zero-Key Food Search Execution ---
  async handleGeminiFoodSearch(context = 'diary') {
    const isModal = context === 'modal';
    const inputEl = document.getElementById(isModal ? 'food-modal-search' : 'diary-search-input');
    const btnEl = document.getElementById(isModal ? 'btn-modal-ask-gemini' : 'btn-diary-ask-gemini');
    const resultBox = document.getElementById(isModal ? 'modal-ai-result' : 'diary-ai-result');

    const query = inputEl.value.trim();
    if (!query) {
      this.showToast('لطفاً نام یا توصیف غذا را تایپ کنید', 'error');
      inputEl.focus();
      return;
    }

    const originalBtnText = btnEl.innerHTML;
    btnEl.innerHTML = '<span class="ai-spinner"></span> در حال استعلام...';
    btnEl.disabled = true;

    try {
      const food = await gemini.analyzeFood(query);
      
      let badgeHtml = '<div class="ai-badge">✨ استخراج شده با Gemini</div>';
      if (food.source === 'openfoodfacts') {
        badgeHtml = '<div class="ai-badge" style="background: linear-gradient(135deg, #0284c7, #06b6d4);">🌍 پایگاه جهانی OpenFoodFacts</div>';
      } else if (food.source === 'smart_local') {
        badgeHtml = '<div class="ai-badge" style="background: linear-gradient(135deg, #10b981, #059669);">⚡ موتور هوشمند تغذیه</div>';
      }

      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div class="ai-result-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              ${badgeHtml}
              <h3 style="font-size: 1.1rem; font-weight: 900; color: #fff; margin-bottom: 2px;">${food.name}</h3>
              <span style="font-size: 0.78rem; color: var(--text-muted);">${food.unit} • دسته‌بندی: ${food.category}</span>
            </div>
            <div style="text-align: left;">
              <span style="font-size: 1.4rem; font-weight: 900; color: #c084fc;">${food.calories}</span>
              <span style="font-size: 0.7rem; color: var(--text-muted); display: block;">کیلوکالری</span>
            </div>
          </div>

          ${food.description ? `<p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 8px;">💡 ${food.description}</p>` : ''}

          <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.3); padding: 10px; border-radius: var(--radius-md); margin-bottom: 14px;">
            <div style="text-align: center;"><span style="font-size: 0.72rem; color: var(--carbs);">کربوهیدرات</span><div style="font-weight: 800; font-size: 0.95rem;">${food.carbs}g</div></div>
            <div style="text-align: center;"><span style="font-size: 0.72rem; color: var(--protein);">پروتئین</span><div style="font-weight: 800; font-size: 0.95rem;">${food.protein}g</div></div>
            <div style="text-align: center;"><span style="font-size: 0.72rem; color: var(--fat);">چربی</span><div style="font-weight: 800; font-size: 0.95rem;">${food.fat}g</div></div>
          </div>

          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-open-picker-from-ai" style="flex: 2; font-size: 0.85rem; padding: 10px;">
              ⚖️ تعیین مقدار و سهم مصرفی
            </button>
            <button class="btn btn-secondary btn-close-ai-card" style="flex: 1; font-size: 0.85rem; padding: 10px;">
              بستن
            </button>
          </div>
        </div>
      `;

      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // باز کردن پاپ‌آپ پیشرفته تعیین مقدار برای غذای هوش مصنوعی
      resultBox.querySelector('.btn-open-picker-from-ai').addEventListener('click', () => {
        this.openPortionPicker(food, this.targetMealForModal);
      });

      resultBox.querySelector('.btn-close-ai-card').addEventListener('click', () => {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
      });

    } catch (err) {
      console.error('Search error:', err);
      this.showToast(err.message || 'خطا در جستجو', 'error');
    } finally {
      btnEl.innerHTML = originalBtnText;
      btnEl.disabled = false;
    }
  }
}

// لود برنامه
window.addEventListener('DOMContentLoaded', () => {
  const app = new HealthApp();
  app.init();
});
