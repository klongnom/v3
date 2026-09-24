/* ==========================================================================
   🌱 10% Rule by Kong - Application Logic & Core Engine
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = '10percent_rule_data';

  // --- Default State Specification ---
  const DEFAULT_STATE = {
    wallets: [
      { id: 'wallet_1', name: 'เงินออม', emoji: '🌱', percent: 10, type: 'savings', balance: 0 },
      { id: 'wallet_2', name: 'เงินลงทุน', emoji: '📈', percent: 5, type: 'investment', balance: 0 },
      { id: 'wallet_3', name: 'เงินใช้จ่าย', emoji: '💳', percent: 85, type: 'spending', balance: 0 }
    ],
    incomes: [],
    expenses: [],
    loans: [], // Lending & Debt Tracking System
    debts: [], // Personal Liabilities System
    incomeSources: ['งานประจำ', 'งานร้านอาหาร', 'งานทำความสะอาด', 'งานเสริม'],
    savingGoal: 30000,
    selfTaxFund: 0,
    investmentFromTax: 0,
    disciplineScore: 0,
    disciplineEvents: {},
    currentMonth: getTodayMonthString(),
    settings: {
      version: '1.2.0'
    }
  };

  // --- Global App State ---
  let state = deepCopy(DEFAULT_STATE);
  let wizardSelectedSource = '';
  let editingWalletId = null;
  let editingLoanId = null;
  let activeRepaymentLoanId = null;

  // Chart instances for smooth destruction and re-creation
  let chartIncomeVsExpenseInstance = null;
  let chartNetWorthTrendInstance = null;

  // --- Thai Month Names Lookup ---
  const THAI_MONTH_NAMES = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  // ==========================================================================
  // 1. INITIALIZATION & STORAGE OPERATORS
  // ==========================================================================

  function initApp() {
    loadData();
    registerServiceWorker();
    bindEvents();
    renderAll();
  }

  function loadData() {
    try {
      const rawData = localStorage.getItem(STORAGE_KEY);
      if (rawData) {
        const parsed = JSON.parse(rawData);
        state = Object.assign({}, deepCopy(DEFAULT_STATE), parsed);

        // Migration & Fallback checks for backwards compatibility
        if (!state.wallets || !Array.isArray(state.wallets) || state.wallets.length < 3) {
          state.wallets = deepCopy(DEFAULT_STATE.wallets);
        }
        if (!state.loans || !Array.isArray(state.loans)) {
          state.loans = [];
        }
        if (!state.debts || !Array.isArray(state.debts)) {
          state.debts = [];
        }
        if (!state.currentMonth) {
          state.currentMonth = getTodayMonthString();
        }
      } else {
        state = deepCopy(DEFAULT_STATE);
        saveData();
      }
    } catch (err) {
      console.error('Failed to load LocalStorage data:', err);
      state = deepCopy(DEFAULT_STATE);
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save to LocalStorage:', err);
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('PWA ServiceWorker registered:', reg.scope))
          .catch((err) => console.warn('ServiceWorker registration failed:', err));
      });
    }
  }

  // ==========================================================================
  // 2. HELPER UTILITIES (MONEY, MONTH, DISCIPLINE, SIMPLE INTEREST)
  // ==========================================================================

  function getTodayMonthString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }

  function getTodayDateString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatMoney(amount) {
    const val = Math.round(Number(amount) || 0);
    return val.toLocaleString('th-TH') + ' บาท';
  }

  function formatThaiMonthYear(monthStr) {
    if (!monthStr || !monthStr.includes('-')) return '';
    const [yyyy, mm] = monthStr.split('-').map(Number);
    const monthName = THAI_MONTH_NAMES[mm - 1] || '';
    const thaiYear = yyyy + 543;
    return `${monthName} ${thaiYear}`;
  }

  function formatThaiDate(dateStr) {
    if (!dateStr) return '';
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return dateStr;
    const day = dateObj.getDate();
    const monthName = THAI_MONTH_NAMES[dateObj.getMonth()];
    const thaiYear = dateObj.getFullYear() + 543;
    return `${day} ${monthName} ${thaiYear}`;
  }

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getSavingsWallet() {
    return state.wallets.find(w => w.type === 'savings' || w.id === 'wallet_1') || state.wallets[0];
  }

  function getInvestmentWallet() {
    return state.wallets.find(w => w.type === 'investment' || w.id === 'wallet_2') || state.wallets[1];
  }

  function getSpendingWallet() {
    return state.wallets.find(w => w.type === 'spending' || w.id === 'wallet_3') || state.wallets[2];
  }

  function addDisciplinePoints(points, eventKey) {
    if (eventKey && state.disciplineEvents[eventKey]) {
      return; // Prevent duplicate scoring
    }

    state.disciplineScore = Math.min(100, Math.max(0, state.disciplineScore + points));
    if (eventKey) {
      state.disciplineEvents[eventKey] = true;
    }
    saveData();
    renderDisciplineCard();
  }

  /**
   * Simple Interest Calculation Formula
   * Per month: Interest = Principal * (Rate / 100) * totalMonths
   * Per year: Interest = Principal * (Rate / 100) * totalYears
   */
  function calculateLoanInterest(principal, rate, unit, years, months) {
    const p = Math.max(0, Number(principal) || 0);
    const r = Math.max(0, Number(rate) || 0);
    const y = Math.max(0, Number(years) || 0);
    const m = Math.max(0, Number(months) || 0);

    const totalMonths = (y * 12) + m;
    const totalYears = y + (m / 12);

    let interestAmount = 0;

    if (unit === 'month') {
      interestAmount = Math.round(p * (r / 100) * totalMonths);
    } else {
      interestAmount = Math.round(p * (r / 100) * totalYears);
    }

    const totalRepayable = p + interestAmount;

    return {
      principal: p,
      interestAmount: Math.max(0, interestAmount),
      totalRepayable: Math.max(0, totalRepayable),
      totalMonths: totalMonths,
      totalYears: totalYears
    };
  }

  // ==========================================================================
  // 3. UI RENDERING PIPELINE
  // ==========================================================================

  function renderAll() {
    renderMonthHeader();
    renderFinancialDashboard();
    renderDashboard();
    renderGoalCard();
    renderSelfTaxCard();
    renderChart();
    renderAnalysisCard();
    renderDisciplineCard();
    renderIncomeHistory();
    renderExpenseHistory();
    renderLendingSection();
    renderWalletSettingsList();
  }

  // ==========================================================================
  // 3.1 FINANCIAL DASHBOARD & NET WORTH ENGINE
  // ==========================================================================

  function renderFinancialDashboard() {
    // 1. Calculate Balances & Net Worth
    const savingsWallet = getSavingsWallet();
    const investmentWallet = getInvestmentWallet();
    const spendingWallet = getSpendingWallet();

    const totalWallets = state.wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
    const savingsBalance = Number(savingsWallet.balance) || 0;
    const investmentBalance = Number(investmentWallet.balance) || 0;
    const spendingBalance = Number(spendingWallet.balance) || 0;

    // Receivables (Loans Outstanding)
    let loansOutstanding = 0;
    state.loans.forEach(loan => {
      const totalPaid = Number(loan.totalPaid) || 0;
      const totalRepayable = Number(loan.totalRepayable) || Number(loan.principal) || 0;
      loansOutstanding += Math.max(0, totalRepayable - totalPaid);
    });

    // Personal Debts
    let personalDebts = 0;
    if (state.debts && Array.isArray(state.debts)) {
      state.debts.forEach(d => {
        const paid = Number(d.paid) || 0;
        const total = Number(d.amount) || 0;
        personalDebts += Math.max(0, total - paid);
      });
    }

    // Net Worth Formula: Wallet Balance + Receivables - Debts
    const netWorth = totalWallets + loansOutstanding - personalDebts;

    // Render Net Worth & Asset Cards
    setElementText('display-net-worth', formatMoney(netWorth));
    setElementText('formula-wallets', formatMoney(totalWallets));
    setElementText('formula-receivables', formatMoney(loansOutstanding));
    setElementText('formula-debts', formatMoney(personalDebts));

    setElementText('fin-total-wallets', formatMoney(totalWallets));
    setElementText('fin-savings-wallet', formatMoney(savingsBalance));
    setElementText('fin-investment-wallet', formatMoney(investmentBalance));
    setElementText('fin-spending-wallet', formatMoney(spendingBalance));
    setElementText('fin-loans-outstanding', formatMoney(loansOutstanding));
    setElementText('fin-personal-debts', formatMoney(personalDebts));

    // 2. Render Monthly Summary
    renderMonthlyReportSection();

    // 3. Render Month-over-Month Comparison
    renderMonthComparisonSection();

    // 4. Render Financial Insights
    renderFinancialInsights();

    // 5. Render Historical Charts
    renderFinancialCharts();
  }

  function renderMonthlyReportSection() {
    setElementText('summary-month-label', formatThaiMonthYear(state.currentMonth));

    const monthIncomes = state.incomes.filter(i => i.month === state.currentMonth);
    const monthExpenses = state.expenses.filter(e => e.month === state.currentMonth);

    const totalIncome = monthIncomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpense = monthExpenses.reduce((sum, e) => sum + (Number(e.totalSpend) || 0), 0);

    const savingsWallet = getSavingsWallet();
    const investmentWallet = getInvestmentWallet();

    let allocatedSavings = 0;
    let allocatedInvestment = 0;

    monthIncomes.forEach(inc => {
      if (inc.allocations && Array.isArray(inc.allocations)) {
        inc.allocations.forEach(a => {
          if (a.walletId === savingsWallet.id) allocatedSavings += (Number(a.amount) || 0);
          else if (a.walletId === investmentWallet.id) allocatedInvestment += (Number(a.amount) || 0);
        });
      }
    });

    // LENT out in this month:
    let monthLent = 0;
    state.loans.forEach(loan => {
      const loanMonth = (loan.startDate || loan.createdMonth || '').slice(0, 7);
      if (loanMonth === state.currentMonth) {
        monthLent += (Number(loan.principal) || 0);
      }
    });

    // REPAID received in this month & INTEREST received in this month:
    let monthRepaid = 0;
    let monthInterest = 0;

    state.loans.forEach(loan => {
      const totalRepayable = Number(loan.totalRepayable) || Number(loan.principal) || 0;
      const interestAmt = Number(loan.interestAmount) || 0;
      const interestRatio = totalRepayable > 0 ? (interestAmt / totalRepayable) : 0;

      if (loan.payments && Array.isArray(loan.payments)) {
        loan.payments.forEach(pay => {
          const payMonth = (pay.date || '').slice(0, 7);
          if (payMonth === state.currentMonth) {
            const payAmount = Number(pay.amount) || 0;
            monthRepaid += payAmount;
            monthInterest += Math.round(payAmount * interestRatio);
          }
        });
      }
    });

    const monthRemaining = Math.max(0, totalIncome - totalExpense - allocatedSavings - allocatedInvestment);

    setElementText('sum-month-income', formatMoney(totalIncome));
    setElementText('sum-month-expense', formatMoney(totalExpense));
    setElementText('sum-month-savings', formatMoney(allocatedSavings));
    setElementText('sum-month-investment', formatMoney(allocatedInvestment));
    setElementText('sum-month-lent', formatMoney(monthLent));
    setElementText('sum-month-repaid', formatMoney(monthRepaid));
    setElementText('sum-month-interest', formatMoney(monthInterest));
    setElementText('sum-month-remaining', formatMoney(monthRemaining));

    // Rates calculation
    let savingsRate = 0;
    if (totalIncome > 0) {
      savingsRate = Math.round((allocatedSavings / totalIncome) * 100);
    }
    setElementText('display-savings-rate', `${savingsRate}%`);
    setElementText('savings-rate-label', `อัตราการออม ${savingsRate}%`);

    let investmentRate = 0;
    if (totalIncome > 0) {
      investmentRate = Math.round((allocatedInvestment / totalIncome) * 100);
    }
    setElementText('display-investment-rate', `${investmentRate}%`);
    setElementText('investment-rate-label', `อัตราการลงทุน ${investmentRate}%`);
  }

  function renderMonthComparisonSection() {
    const [yyyy, mm] = state.currentMonth.split('-').map(Number);
    const prevDate = new Date(yyyy, mm - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    setElementText('compare-prev-month-name', formatThaiMonthYear(prevMonthStr));

    // Current Month Metrics
    const curIncomes = state.incomes.filter(i => i.month === state.currentMonth);
    const curExpenses = state.expenses.filter(e => e.month === state.currentMonth);
    const curIncTotal = curIncomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const curExpTotal = curExpenses.reduce((s, e) => s + (Number(e.totalSpend) || 0), 0);

    const savingsWallet = getSavingsWallet();
    const investmentWallet = getInvestmentWallet();

    let curSavAlloc = 0;
    let curInvAlloc = 0;
    curIncomes.forEach(i => {
      if (i.allocations) {
        i.allocations.forEach(a => {
          if (a.walletId === savingsWallet.id) curSavAlloc += (Number(a.amount) || 0);
          else if (a.walletId === investmentWallet.id) curInvAlloc += (Number(a.amount) || 0);
        });
      }
    });

    // Previous Month Metrics
    const prevIncomes = state.incomes.filter(i => i.month === prevMonthStr);
    const prevExpenses = state.expenses.filter(e => e.month === prevMonthStr);
    const prevIncTotal = prevIncomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const prevExpTotal = prevExpenses.reduce((s, e) => s + (Number(e.totalSpend) || 0), 0);

    let prevSavAlloc = 0;
    let prevInvAlloc = 0;
    prevIncomes.forEach(i => {
      if (i.allocations) {
        i.allocations.forEach(a => {
          if (a.walletId === savingsWallet.id) prevSavAlloc += (Number(a.amount) || 0);
          else if (a.walletId === investmentWallet.id) prevInvAlloc += (Number(a.amount) || 0);
        });
      }
    });

    updateCompareBadge('cmp-income-diff', curIncTotal, prevIncTotal, false);
    updateCompareBadge('cmp-expense-diff', curExpTotal, prevExpTotal, true);
    updateCompareBadge('cmp-savings-diff', curSavAlloc, prevSavAlloc, false);
    updateCompareBadge('cmp-investment-diff', curInvAlloc, prevInvAlloc, false);
  }

  function updateCompareBadge(elementId, currentVal, prevVal, isExpense = false) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (!prevVal || prevVal === 0 || isNaN(prevVal)) {
      el.textContent = 'ไม่มีข้อมูลเปรียบเทียบ';
      el.className = 'cmp-value text-muted';
      return;
    }

    const diffPct = Math.round(((currentVal - prevVal) / prevVal) * 100);

    if (isNaN(diffPct) || !isFinite(diffPct)) {
      el.textContent = 'ไม่มีข้อมูลเปรียบเทียบ';
      el.className = 'cmp-value text-muted';
      return;
    }

    if (diffPct > 0) {
      el.textContent = `+${diffPct}%`;
      el.className = `cmp-value ${isExpense ? 'text-danger' : 'text-highlight green'}`;
    } else if (diffPct < 0) {
      el.textContent = `${diffPct}%`;
      el.className = `cmp-value ${isExpense ? 'text-highlight green' : 'text-danger'}`;
    } else {
      el.textContent = '0%';
      el.className = 'cmp-value text-muted';
    }
  }

  function renderFinancialInsights() {
    const container = document.getElementById('financial-insights-list');
    if (!container) return;

    container.innerHTML = '';

    const insights = [];

    const monthIncomes = state.incomes.filter(i => i.month === state.currentMonth);
    const monthExpenses = state.expenses.filter(e => e.month === state.currentMonth);
    const totalIncome = monthIncomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpense = monthExpenses.reduce((sum, e) => sum + (Number(e.totalSpend) || 0), 0);

    const [yyyy, mm] = state.currentMonth.split('-').map(Number);
    const prevDate = new Date(yyyy, mm - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const prevExpenses = state.expenses.filter(e => e.month === prevMonthStr);
    const prevTotalExpense = prevExpenses.reduce((sum, e) => sum + (Number(e.totalSpend) || 0), 0);

    const savingsWallet = getSavingsWallet();
    let curSavingsAlloc = 0;
    monthIncomes.forEach(i => {
      if (i.allocations) {
        const a = i.allocations.find(x => x.walletId === savingsWallet.id);
        if (a) curSavingsAlloc += (Number(a.amount) || 0);
      }
    });

    const prevIncomes = state.incomes.filter(i => i.month === prevMonthStr);
    let prevSavingsAlloc = 0;
    prevIncomes.forEach(i => {
      if (i.allocations) {
        const a = i.allocations.find(x => x.walletId === savingsWallet.id);
        if (a) prevSavingsAlloc += (Number(a.amount) || 0);
      }
    });

    let loansOutstanding = 0;
    state.loans.forEach(loan => {
      const totalPaid = Number(loan.totalPaid) || 0;
      const totalRepayable = Number(loan.totalRepayable) || Number(loan.principal) || 0;
      loansOutstanding += Math.max(0, totalRepayable - totalPaid);
    });

    // 1. Income check
    if (totalIncome === 0) {
      insights.push({
        type: 'info',
        icon: 'ℹ️',
        text: 'ยังไม่มีข้อมูลรายรับของเดือนนี้'
      });
    }

    // 2. Expense increase check
    if (prevTotalExpense > 0 && totalExpense > prevTotalExpense) {
      const diff = totalExpense - prevTotalExpense;
      insights.push({
        type: 'warning',
        icon: '⚠️',
        text: `รายจ่ายเดือนนี้เพิ่มขึ้นจากเดือนก่อน (${formatMoney(diff)})`
      });
    }

    // 3. Savings increase check
    if (curSavingsAlloc > prevSavingsAlloc && curSavingsAlloc > 0) {
      insights.push({
        type: 'success',
        icon: '🌱',
        text: 'เงินออมเดือนนี้เพิ่มขึ้น'
      });
    }

    // 4. Outstanding loans check
    if (loansOutstanding > 0) {
      insights.push({
        type: 'warning',
        icon: '💸',
        text: `มีเงินค้างจากลูกหนี้จำนวนมาก (${formatMoney(loansOutstanding)}) ควรติดตามกำหนดคืน`
      });
    }

    // Render insights list
    if (insights.length === 0) {
      container.innerHTML = '<div class="insight-badge insight-info"><span class="insight-icon">ℹ️</span><span class="insight-text">เริ่มบันทึกข้อมูลเพื่อดูบทวิเคราะห์การเงิน</span></div>';
    } else {
      insights.forEach(item => {
        const itemHtml = `
          <div class="insight-badge insight-${item.type}">
            <span class="insight-icon">${item.icon}</span>
            <span class="insight-text">${escapeHtml(item.text)}</span>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHtml);
      });
    }
  }

  function getPastMonthsList(count = 4) {
    const list = [];
    const [curYear, curMonthNum] = state.currentMonth.split('-').map(Number);

    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(curYear, curMonthNum - 1 - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      list.push(`${yyyy}-${mm}`);
    }
    return list;
  }

  function renderFinancialCharts() {
    const monthKeys = getPastMonthsList(4);
    const monthLabels = monthKeys.map(m => formatThaiMonthYear(m));

    const incomeData = [];
    const expenseData = [];
    const netWorthData = [];

    monthKeys.forEach(mKey => {
      const mIncomes = state.incomes.filter(i => i.month === mKey);
      const incTotal = mIncomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      incomeData.push(incTotal);

      const mExpenses = state.expenses.filter(e => e.month === mKey);
      const expTotal = mExpenses.reduce((sum, e) => sum + (Number(e.totalSpend) || 0), 0);
      expenseData.push(expTotal);

      const incCumulative = state.incomes
        .filter(i => i.month <= mKey)
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

      const expCumulative = state.expenses
        .filter(e => e.month <= mKey)
        .reduce((sum, e) => sum + (Number(e.totalSpend) || 0), 0);

      let loansActiveAtMonth = 0;
      state.loans.forEach(loan => {
        const loanMonth = (loan.startDate || loan.createdMonth || '').slice(0, 7);
        if (loanMonth <= mKey) {
          const totalRepayable = Number(loan.totalRepayable) || Number(loan.principal) || 0;
          const paidUpToMonth = (loan.payments || [])
            .filter(p => (p.date || '').slice(0, 7) <= mKey)
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

          loansActiveAtMonth += Math.max(0, totalRepayable - paidUpToMonth);
        }
      });

      const monthEndNetWorth = Math.max(0, incCumulative - expCumulative + loansActiveAtMonth);
      netWorthData.push(monthEndNetWorth);
    });

    if (typeof Chart !== 'undefined') {
      renderChartJS('chart-income-vs-expense', 'bar', monthLabels, [
        { label: 'รายรับ', data: incomeData, backgroundColor: '#10b981', borderRadius: 4 },
        { label: 'รายจ่าย', data: expenseData, backgroundColor: '#ef4444', borderRadius: 4 }
      ], 'incomeVsExpense');

      renderChartJS('chart-net-worth-trend', 'line', monthLabels, [
        {
          label: 'มูลค่าการเงินสุทธิ',
          data: netWorthData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#3b82f6',
          pointRadius: 4
        }
      ], 'netWorthTrend');
    } else {
      renderCanvasFallback('chart-income-vs-expense', monthLabels, incomeData, expenseData);
      renderCanvasLineFallback('chart-net-worth-trend', monthLabels, netWorthData);
    }
  }

  function renderChartJS(canvasId, type, labels, datasets, instanceType) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (instanceType === 'incomeVsExpense' && chartIncomeVsExpenseInstance) {
      chartIncomeVsExpenseInstance.destroy();
    } else if (instanceType === 'netWorthTrend' && chartNetWorthTrendInstance) {
      chartNetWorthTrendInstance.destroy();
    }

    const config = {
      type: type,
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { family: 'Kanit' } }
          }
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8', font: { family: 'Kanit' } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            ticks: { color: '#94a3b8', font: { family: 'Kanit' } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        }
      }
    };

    const newChart = new Chart(ctx, config);

    if (instanceType === 'incomeVsExpense') {
      chartIncomeVsExpenseInstance = newChart;
    } else if (instanceType === 'netWorthTrend') {
      chartNetWorthTrendInstance = newChart;
    }
  }

  function renderCanvasFallback(canvasId, labels, incomeData, expenseData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 300;
    const height = canvas.height = 240;

    ctx.clearRect(0, 0, width, height);

    const padding = 35;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const maxVal = Math.max(1, ...incomeData, ...expenseData);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    const groupW = chartW / labels.length;
    const barW = Math.max(8, Math.min(22, (groupW - 12) / 2));

    labels.forEach((lbl, idx) => {
      const groupX = padding + idx * groupW + groupW / 2;

      const incH = (incomeData[idx] / maxVal) * chartH;
      const incX = groupX - barW - 2;
      const incY = padding + chartH - incH;
      ctx.fillStyle = '#10b981';
      ctx.fillRect(incX, incY, barW, incH);

      const expH = (expenseData[idx] / maxVal) * chartH;
      const expX = groupX + 2;
      const expY = padding + chartH - expH;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(expX, expY, barW, expH);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Kanit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lbl.split(' ')[0], groupX, height - 10);
    });
  }

  function renderCanvasLineFallback(canvasId, labels, dataPoints) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 300;
    const height = canvas.height = 240;

    ctx.clearRect(0, 0, width, height);

    const padding = 35;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const maxVal = Math.max(1, ...dataPoints);
    const minVal = Math.min(0, ...dataPoints);
    const range = Math.max(1, maxVal - minVal);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    const stepX = chartW / Math.max(1, labels.length - 1);
    const points = dataPoints.map((val, idx) => {
      const x = padding + idx * stepX;
      const y = padding + chartH - ((val - minVal) / range) * chartH;
      return { x, y, val };
    });

    if (points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, padding + chartH);
      points.forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.lineTo(points[points.length - 1].x, padding + chartH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.stroke();

      points.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Kanit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[idx].split(' ')[0], pt.x, height - 10);
      });
    }
  }

  function renderMonthHeader() {
    const monthTextEl = document.getElementById('display-month-name');
    if (monthTextEl) {
      monthTextEl.textContent = formatThaiMonthYear(state.currentMonth);
    }
  }

  function renderDashboard() {
    // 1. Calculate current month incomes total
    const monthIncomes = state.incomes.filter(i => i.month === state.currentMonth);
    const totalMonthIncome = monthIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    const displayIncomeEl = document.getElementById('display-month-income');
    if (displayIncomeEl) {
      displayIncomeEl.textContent = formatMoney(totalMonthIncome);
    }

    // 2. Render Main Wallets
    const savingsWallet = getSavingsWallet();
    const investmentWallet = getInvestmentWallet();
    const spendingWallet = getSpendingWallet();

    setElementText('emoji-savings', savingsWallet.emoji || '🌱');
    setElementText('name-savings', savingsWallet.name || 'เงินออมสะสม');
    setElementText('balance-savings', formatMoney(savingsWallet.balance));
    setElementText('percent-savings', `ออม ${savingsWallet.percent}%`);

    setElementText('emoji-investment', investmentWallet.emoji || '📈');
    setElementText('name-investment', investmentWallet.name || 'เงินลงทุนสะสม');
    setElementText('balance-investment', formatMoney(investmentWallet.balance));
    setElementText('percent-investment', `ลงทุน ${investmentWallet.percent}%`);

    setElementText('emoji-spending', spendingWallet.emoji || '💳');
    setElementText('name-spending', spendingWallet.name || 'เงินใช้ได้');
    setElementText('balance-spending', formatMoney(spendingWallet.balance));
    setElementText('percent-spending', `ใช้จ่าย ${spendingWallet.percent}%`);

    // 3. Render Custom Additional Wallets
    const customWalletsContainer = document.getElementById('custom-wallets-container');
    if (customWalletsContainer) {
      const customWallets = state.wallets.filter(w => 
        w.id !== savingsWallet.id && 
        w.id !== investmentWallet.id && 
        w.id !== spendingWallet.id
      );

      customWalletsContainer.innerHTML = '';
      if (customWallets.length > 0) {
        customWallets.forEach(w => {
          const cardHtml = `
            <div class="wallet-card custom-theme">
              <div class="wallet-icon-title">
                <span class="wallet-emoji">${w.emoji || '💰'}</span>
                <span class="wallet-name">${escapeHtml(w.name)}</span>
              </div>
              <div class="wallet-balance">${formatMoney(w.balance)}</div>
              <div class="wallet-badge">${w.percent}%</div>
            </div>
          `;
          customWalletsContainer.insertAdjacentHTML('beforeend', cardHtml);
        });
      }
    }

    // 4. Render Dynamic Allocation Percentage Badge Header
    const badgeContainer = document.getElementById('allocation-badge-container');
    if (badgeContainer) {
      const totalSavingsInvestPercent = savingsWallet.percent + investmentWallet.percent;
      badgeContainer.innerHTML = `
        <span class="allocation-summary-chip">
          🌱 ออม ${savingsWallet.percent}% + 📈 ลงทุน ${investmentWallet.percent}% = ${totalSavingsInvestPercent}% ของรายได้
        </span>
      `;
    }
  }

  function renderGoalCard() {
    const savingsWallet = getSavingsWallet();
    const currentSavings = savingsWallet.balance;
    const targetGoal = state.savingGoal || 30000;
    const percent = Math.min(100, Math.round((currentSavings / targetGoal) * 100));

    setElementText('goal-current-amount', formatMoney(currentSavings));
    setElementText('goal-target-amount', formatMoney(targetGoal));
    setElementText('goal-percent-text', `${percent}%`);

    const progressBar = document.getElementById('goal-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }

    const statusTextEl = document.getElementById('goal-status-text');
    if (statusTextEl) {
      if (percent >= 100) {
        statusTextEl.textContent = '🎉 บรรลุเป้าหมายเงินก้อนแล้ว!';
        addDisciplinePoints(10, `goal_achieved_${targetGoal}`);
      } else if (percent >= 50) {
        statusTextEl.textContent = '👍 สะสมเกินครึ่งทางแล้ว สู้ต่อ!';
      } else {
        statusTextEl.textContent = 'เริ่มต้นสร้างเงินก้อนแรก';
      }
    }
  }

  function renderSelfTaxCard() {
    const currentTaxFund = state.selfTaxFund || 0;
    const taxGoal = 500;
    const percent = Math.min(100, Math.round((currentTaxFund / taxGoal) * 100));
    const nextAmountNeeded = Math.max(0, taxGoal - currentTaxFund);

    setElementText('tax-fund-amount', `${currentTaxFund.toLocaleString('th-TH')} / ${taxGoal} บาท`);
    setElementText('tax-total-investment-amount', formatMoney(state.investmentFromTax || 0));
    setElementText('tax-next-conversion', `อีก ${nextAmountNeeded.toLocaleString('th-TH')} บาท → เปลี่ยนเป็นเงินลงทุน`);

    const progressBar = document.getElementById('tax-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
  }

  function renderChart() {
    // Current month dataset
    const monthIncomes = state.incomes.filter(i => i.month === state.currentMonth);
    const monthExpenses = state.expenses.filter(e => e.month === state.currentMonth);

    const totalIncome = monthIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalExpenses = monthExpenses.reduce((sum, item) => sum + (Number(item.totalSpend) || 0), 0);

    const savingsWallet = getSavingsWallet();
    const investmentWallet = getInvestmentWallet();
    const spendingWallet = getSpendingWallet();

    // Calculate actual THB allocated for current month from income records
    let allocatedSavingsTHB = 0;
    let allocatedInvestmentTHB = 0;
    let allocatedSpendingTHB = 0;

    monthIncomes.forEach(inc => {
      if (inc.allocations && Array.isArray(inc.allocations)) {
        inc.allocations.forEach(alloc => {
          if (alloc.walletId === savingsWallet.id) allocatedSavingsTHB += alloc.amount;
          else if (alloc.walletId === investmentWallet.id) allocatedInvestmentTHB += alloc.amount;
          else if (alloc.walletId === spendingWallet.id) allocatedSpendingTHB += alloc.amount;
        });
      }
    });

    const remainingSpendingTHB = Math.max(0, allocatedSpendingTHB - totalExpenses);

    // Calculate percentages relative to month income
    let savPct = 0, invPct = 0, expPct = 0, remPct = 0;
    if (totalIncome > 0) {
      savPct = Math.round((allocatedSavingsTHB / totalIncome) * 100);
      invPct = Math.round((allocatedInvestmentTHB / totalIncome) * 100);
      expPct = Math.min(100, Math.round((totalExpenses / totalIncome) * 100));
      remPct = Math.max(0, Math.round((remainingSpendingTHB / totalIncome) * 100));
    }

    // Set width of bar segments
    setStyleWidth('bar-savings', `${savPct}%`);
    setStyleWidth('bar-investment', `${invPct}%`);
    setStyleWidth('bar-expense', `${expPct}%`);
    setStyleWidth('bar-remaining', `${remPct}%`);

    // Legend Texts
    setElementText('legend-savings-val', `${formatMoney(allocatedSavingsTHB)} (${savPct}%)`);
    setElementText('legend-investment-val', `${formatMoney(allocatedInvestmentTHB)} (${invPct}%)`);
    setElementText('legend-expense-val', `${formatMoney(totalExpenses)} (${expPct}%)`);
    setElementText('legend-remaining-val', `${formatMoney(remainingSpendingTHB)} (${remPct}%)`);
  }

  function renderAnalysisCard() {
    const badgeEl = document.getElementById('analysis-status-badge');
    const descEl = document.getElementById('analysis-description');

    if (!badgeEl || !descEl) return;

    const monthIncomes = state.incomes.filter(i => i.month === state.currentMonth);
    const monthExpenses = state.expenses.filter(e => e.month === state.currentMonth);

    const totalIncome = monthIncomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + (Number(e.totalSpend) || 0), 0);

    const spendingWallet = getSpendingWallet();
    let allocatedSpendingTHB = 0;

    monthIncomes.forEach(inc => {
      if (inc.allocations) {
        const alloc = inc.allocations.find(a => a.walletId === spendingWallet.id);
        if (alloc) allocatedSpendingTHB += alloc.amount;
      }
    });

    if (totalIncome === 0) {
      badgeEl.className = 'status-banner status-none';
      badgeEl.textContent = '⚪ ยังไม่มีข้อมูล';
      descEl.textContent = 'เริ่มบันทึกรายได้และค่าใช้จ่ายเพื่อดูการวิเคราะห์การเงินรายเดือนของคุณ';
      return;
    }

    if (totalExpenses > allocatedSpendingTHB || spendingWallet.balance < 0) {
      const overAmount = totalExpenses - allocatedSpendingTHB;
      badgeEl.className = 'status-banner status-over';
      badgeEl.textContent = '🔴 สถานะเดือนนี้: เกินงบ';
      descEl.textContent = `ค่าใช้จ่ายเกินงบ ${formatMoney(overAmount)} หลังจากกันเงินออมและเงินลงทุนแล้ว ควรระมัดระวังการใช้จ่าย`;
    } else if (allocatedSpendingTHB > 0 && (totalExpenses / allocatedSpendingTHB) > 0.70) {
      const usagePct = Math.round((totalExpenses / allocatedSpendingTHB) * 100);
      badgeEl.className = 'status-banner status-warn';
      badgeEl.textContent = '🟡 สถานะเดือนนี้: ระวัง';
      descEl.textContent = `คุณใช้เงินใช้จ่ายไปแล้ว ${usagePct}% ของงบประมาณ ใกล้ถึงขีดจำกัดแล้ว`;
    } else {
      badgeEl.className = 'status-banner status-good';
      badgeEl.textContent = '🟢 สถานะเดือนนี้: ดี';
      descEl.textContent = 'การบริหารเงินในเดือนนี้ดีเยี่ยม! ออมก่อนใช้และอยู่ในงบประมาณที่กำหนดไว้';
      addDisciplinePoints(10, `budget_respected_${state.currentMonth}`);
    }
  }

  function renderDisciplineCard() {
    const score = state.disciplineScore || 0;
    setElementText('discipline-score-num', score);

    const progressBar = document.getElementById('discipline-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${score}%`;
    }

    const levelBadgeEl = document.getElementById('discipline-level-badge');
    const msgEl = document.getElementById('discipline-message');

    let tierClass = 'badge-tier-1';
    let tierTitle = '🌱 เริ่มต้น';
    let tierMsg = '🌱 เริ่มต้นสร้างนิสัยทางการเงิน คะแนนจะเพิ่มขึ้นจากพฤติกรรมทางการเงินของคุณ';

    if (score >= 90) {
      tierClass = 'badge-tier-4';
      tierTitle = '🏆 Financial Master';
      tierMsg = '🏆 สดุดีปรมาจารย์ทางการเงิน! คุณออมและลงทุนได้อย่างสม่ำเสมอ มีวินัยยอดเยี่ยมที่สุด';
    } else if (score >= 60) {
      tierClass = 'badge-tier-3';
      tierTitle = '🟢 นักสร้างอนาคต';
      tierMsg = '🟢 ยอดเยี่ยมมาก! คุณกำลังสร้างอนาคตทางการเงินที่มั่นคง ออมก่อนใช้ได้อย่างต่อเนื่อง';
    } else if (score >= 30) {
      tierClass = 'badge-tier-2';
      tierTitle = '🟡 ผู้ฝึกวินัย';
      tierMsg = '🟡 เริ่มเห็นผลลัพธ์! คุณเริ่มมีวินัยในการจัดสรรเงินเข้าซองก่อนนำไปใช้จ่าย';
    }

    if (levelBadgeEl) {
      levelBadgeEl.className = `level-badge ${tierClass}`;
      levelBadgeEl.textContent = tierTitle;
    }
    if (msgEl) {
      msgEl.textContent = tierMsg;
    }
  }

  function renderIncomeHistory() {
    const listContainer = document.getElementById('income-list-container');
    const countBadge = document.getElementById('income-count-badge');
    if (!listContainer) return;

    const monthIncomes = state.incomes.filter(i => i.month === state.currentMonth);

    if (countBadge) {
      countBadge.textContent = `${monthIncomes.length} รายการ`;
    }

    listContainer.innerHTML = '';
    if (monthIncomes.length === 0) {
      listContainer.innerHTML = '<div class="empty-state text-muted">ยังไม่มีรายการรายได้ในเดือนนี้</div>';
      return;
    }

    monthIncomes.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
      const itemHtml = `
        <div class="history-item">
          <div class="item-main-info">
            <span class="item-title">💰 ${escapeHtml(item.sourceName)}</span>
            <div class="item-meta">
              <span>📅 ${formatThaiDate(item.date)}</span>
            </div>
          </div>
          <div class="item-amount-action">
            <span class="amount-plus">+${formatMoney(item.amount)}</span>
            <button class="btn-delete-item" data-id="${item.id}" title="ลบรายการรายได้" aria-label="ลบรายการรายได้">
              🗑️
            </button>
          </div>
        </div>
      `;
      listContainer.insertAdjacentHTML('beforeend', itemHtml);
    });

    // Bind delete events
    listContainer.querySelectorAll('.btn-delete-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        deleteIncome(id);
      });
    });
  }

  function renderExpenseHistory() {
    const listContainer = document.getElementById('expense-list-container');
    const countBadge = document.getElementById('expense-count-badge');
    if (!listContainer) return;

    const monthExpenses = state.expenses.filter(e => e.month === state.currentMonth);

    if (countBadge) {
      countBadge.textContent = `${monthExpenses.length} รายการ`;
    }

    listContainer.innerHTML = '';
    if (monthExpenses.length === 0) {
      listContainer.innerHTML = '<div class="empty-state text-muted">ยังไม่มีรายการค่าใช้จ่ายในเดือนนี้</div>';
      return;
    }

    monthExpenses.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
      const taxBadge = item.selfTax > 0 ? `<span class="text-xs text-highlight blue">(Self Tax +${formatMoney(item.selfTax)})</span>` : '';
      const itemHtml = `
        <div class="history-item">
          <div class="item-main-info">
            <span class="item-title">${escapeHtml(item.category)} - ${escapeHtml(item.name)}</span>
            <div class="item-meta">
              <span>📅 ${formatThaiDate(item.date)}</span>
              ${taxBadge}
            </div>
          </div>
          <div class="item-amount-action">
            <span class="amount-minus">-${formatMoney(item.totalSpend)}</span>
            <button class="btn-delete-item-exp" data-id="${item.id}" title="ลบรายการค่าใช้จ่าย" aria-label="ลบรายการค่าใช้จ่าย">
              🗑️
            </button>
          </div>
        </div>
      `;
      listContainer.insertAdjacentHTML('beforeend', itemHtml);
    });

    // Bind delete expense events
    listContainer.querySelectorAll('.btn-delete-item-exp').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        deleteExpense(id);
      });
    });
  }

  // ==========================================================================
  // 4. INCOME WIZARD ENGINE
  // ==========================================================================

  function openIncomeWizard() {
    wizardSelectedSource = '';
    const amountInput = document.getElementById('input-income-amount');
    const sourceInput = document.getElementById('input-custom-source');
    const dateInput = document.getElementById('input-income-date');

    if (amountInput) amountInput.value = '';
    if (sourceInput) sourceInput.value = '';
    if (dateInput) dateInput.value = getTodayDateString();

    renderIncomeSourcesChips();
    showWizardPage(1);
    openModal('modal-income-wizard');
  }

  function renderIncomeSourcesChips() {
    const chipContainer = document.getElementById('income-sources-list');
    if (!chipContainer) return;

    chipContainer.innerHTML = '';
    state.incomeSources.forEach(source => {
      const chip = document.createElement('div');
      chip.className = `source-chip ${wizardSelectedSource === source ? 'selected' : ''}`;
      chip.textContent = source;
      chip.addEventListener('click', () => {
        wizardSelectedSource = source;
        renderIncomeSourcesChips();
      });
      chipContainer.appendChild(chip);
    });
  }

  function showWizardPage(pageNum) {
    const page1 = document.getElementById('wizard-page-1');
    const page2 = document.getElementById('wizard-page-2');
    const stepLabel = document.getElementById('wizard-step-label');

    if (pageNum === 1) {
      if (page1) page1.classList.remove('hidden');
      if (page2) page2.classList.add('hidden');
      if (stepLabel) stepLabel.textContent = 'Step 1 / 2';
    } else {
      if (page1) page1.classList.add('hidden');
      if (page2) page2.classList.remove('hidden');
      if (stepLabel) stepLabel.textContent = 'Step 2 / 2';
      
      const sourceDisplay = document.getElementById('display-selected-source-name');
      if (sourceDisplay) sourceDisplay.textContent = wizardSelectedSource;

      updateWizardAllocationPreview();
    }
  }

  function updateWizardAllocationPreview() {
    const amountInput = document.getElementById('input-income-amount');
    const previewList = document.getElementById('wizard-allocation-preview-list');
    if (!previewList) return;

    const incomeAmount = Number(amountInput ? amountInput.value : 0) || 0;
    previewList.innerHTML = '';

    let totalAllocated = 0;

    state.wallets.forEach(w => {
      const walletAlloc = Math.round(incomeAmount * (w.percent / 100));
      totalAllocated += walletAlloc;

      const rowHtml = `
        <div class="alloc-row">
          <div class="alloc-left">
            <span>${w.emoji}</span>
            <span>${escapeHtml(w.name)}</span>
            <span class="text-muted">(${w.percent}%)</span>
          </div>
          <div class="font-bold text-highlight green">
            +${formatMoney(walletAlloc)}
          </div>
        </div>
      `;
      previewList.insertAdjacentHTML('beforeend', rowHtml);
    });

    if (incomeAmount > 0) {
      const summaryHtml = `
        <div class="alloc-row font-bold mt-2" style="border-top: 1px dashed var(--border-card);">
          <div>รวมจัดสรร:</div>
          <div>${formatMoney(totalAllocated)}</div>
        </div>
      `;
      previewList.insertAdjacentHTML('beforeend', summaryHtml);
    }
  }

  function confirmAddIncome() {
    const amountInput = document.getElementById('input-income-amount');
    const dateInput = document.getElementById('input-income-date');
    const amount = Number(amountInput ? amountInput.value : 0);

    if (!wizardSelectedSource) {
      showAlert('⚠️ กรุณาเลือกแหล่งรายได้ในขั้นตอนที่ 1');
      showWizardPage(1);
      return;
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      showAlert('⚠️ กรุณาระบุจำนวนเงินรายได้ที่ถูกต้อง (มากกว่า 0 บาท)');
      return;
    }

    const dateStr = (dateInput && dateInput.value) ? dateInput.value : getTodayDateString();
    const monthStr = dateStr.slice(0, 7);

    // Save income source if new
    if (!state.incomeSources.includes(wizardSelectedSource)) {
      state.incomeSources.push(wizardSelectedSource);
    }

    // Compute exact allocations snapshot
    const allocations = [];
    let allocatedSum = 0;

    state.wallets.forEach((w) => {
      let allocAmt = Math.round(amount * (w.percent / 100));
      allocations.push({
        walletId: w.id,
        walletName: w.name,
        emoji: w.emoji,
        percent: w.percent,
        amount: allocAmt
      });

      // Update wallet balance immediately
      w.balance += allocAmt;
      allocatedSum += allocAmt;
    });

    // Create Income Object
    const newIncome = {
      id: 'inc_' + Date.now(),
      sourceId: 'src_' + Date.now(),
      sourceName: wizardSelectedSource,
      amount: amount,
      month: monthStr,
      date: dateStr,
      allocations: allocations
    };

    state.incomes.push(newIncome);

    // Award Discipline Score (+5 for adding income)
    addDisciplinePoints(5, null);

    saveData();
    closeModal('modal-income-wizard');
    renderAll();
  }

  function deleteIncome(incomeId) {
    const incIndex = state.incomes.findIndex(i => i.id === incomeId);
    if (incIndex === -1) return;

    const incomeItem = state.incomes[incIndex];

    // REVERSE allocations from wallets
    if (incomeItem.allocations && Array.isArray(incomeItem.allocations)) {
      incomeItem.allocations.forEach(alloc => {
        const targetWallet = state.wallets.find(w => w.id === alloc.walletId);
        if (targetWallet) {
          targetWallet.balance = Math.max(0, targetWallet.balance - alloc.amount);
        }
      });
    }

    // Remove from array
    state.incomes.splice(incIndex, 1);
    saveData();
    renderAll();
  }

  // ==========================================================================
  // 5. EXPENSE ENGINE & OVERSPEND PROTECTION & SELF TAX
  // ==========================================================================

  function openExpenseModal() {
    const nameInput = document.getElementById('input-expense-name');
    const amountInput = document.getElementById('input-expense-amount');
    const dateInput = document.getElementById('input-expense-date');
    const checkboxTax = document.getElementById('checkbox-self-tax');

    if (nameInput) nameInput.value = '';
    if (amountInput) amountInput.value = '';
    if (dateInput) dateInput.value = getTodayDateString();
    if (checkboxTax) checkboxTax.checked = false;

    updateSelfTaxPreview();
    openModal('modal-expense');
  }

  function updateSelfTaxPreview() {
    const amountInput = document.getElementById('input-expense-amount');
    const checkboxTax = document.getElementById('checkbox-self-tax');
    const previewBox = document.getElementById('self-tax-preview-info');

    const expenseAmt = Number(amountInput ? amountInput.value : 0) || 0;
    const isSelfTax = checkboxTax ? checkboxTax.checked : false;

    if (isSelfTax && expenseAmt > 0) {
      const taxAmt = Math.round(expenseAmt * 0.10);
      const totalSpend = expenseAmt + taxAmt;

      setElementText('preview-expense-val', expenseAmt.toLocaleString('th-TH'));
      setElementText('preview-tax-val', taxAmt.toLocaleString('th-TH'));
      setElementText('preview-total-spend-val', totalSpend.toLocaleString('th-TH'));

      if (previewBox) previewBox.classList.remove('hidden');
    } else {
      if (previewBox) previewBox.classList.add('hidden');
    }
  }

  function saveExpense() {
    const nameInput = document.getElementById('input-expense-name');
    const categorySelect = document.getElementById('select-expense-category');
    const amountInput = document.getElementById('input-expense-amount');
    const dateInput = document.getElementById('input-expense-date');
    const checkboxTax = document.getElementById('checkbox-self-tax');

    const name = nameInput ? nameInput.value.trim() : '';
    const category = categorySelect ? categorySelect.value : '📦 อื่น ๆ';
    const expenseAmt = Number(amountInput ? amountInput.value : 0);
    const dateStr = (dateInput && dateInput.value) ? dateInput.value : getTodayDateString();
    const monthStr = dateStr.slice(0, 7);

    if (!name) {
      showAlert('⚠️ กรุณากรอกชื่อรายการค่าใช้จ่าย');
      return;
    }

    if (!expenseAmt || isNaN(expenseAmt) || expenseAmt <= 0) {
      showAlert('⚠️ กรุณากรอกจำนวนเงินค่าใช้จ่ายที่ถูกต้อง');
      return;
    }

    const isSelfTax = checkboxTax ? checkboxTax.checked : false;
    const selfTaxAmt = isSelfTax ? Math.round(expenseAmt * 0.10) : 0;
    const totalSpend = expenseAmt + selfTaxAmt;

    // Spending Wallet Check
    const spendingWallet = getSpendingWallet();

    // OVERSPEND PROTECTION: Check if expense > spending wallet balance
    if (totalSpend > spendingWallet.balance) {
      const deficit = totalSpend - spendingWallet.balance;
      showAlert(
        `⚠️ เงินใช้จ่ายไม่เพียงพอ!\n\n` +
        `• เงินใช้ได้คงเหลือ: ${formatMoney(spendingWallet.balance)}\n` +
        `• ยอดค่าใช้จ่ายรวม: ${formatMoney(totalSpend)}\n` +
        `• ขาดอีก: ${formatMoney(deficit)}`
      );
      return;
    }

    // Deduct total spend strictly from Spending Wallet
    spendingWallet.balance -= totalSpend;

    // Handle Self Tax Accumulation & Auto-conversion to Investment Wallet
    if (selfTaxAmt > 0) {
      state.selfTaxFund = (state.selfTaxFund || 0) + selfTaxAmt;

      // Auto-conversion loop for every 500 THB reached
      while (state.selfTaxFund >= 500) {
        state.selfTaxFund -= 500;
        state.investmentFromTax = (state.investmentFromTax || 0) + 500;

        const investmentWallet = getInvestmentWallet();
        investmentWallet.balance += 500;

        // Award +10 points for Self Tax milestone conversion
        addDisciplinePoints(10, null);
      }
    }

    // Create Expense Object
    const newExpense = {
      id: 'exp_' + Date.now(),
      name: name,
      category: category,
      amount: expenseAmt,
      selfTax: selfTaxAmt,
      totalSpend: totalSpend,
      month: monthStr,
      date: dateStr,
      walletId: spendingWallet.id
    };

    state.expenses.push(newExpense);

    // Award +5 points for recording expense
    addDisciplinePoints(5, null);

    saveData();
    closeModal('modal-expense');
    renderAll();
  }

  function deleteExpense(expenseId) {
    const expIndex = state.expenses.findIndex(e => e.id === expenseId);
    if (expIndex === -1) return;

    const expItem = state.expenses[expIndex];

    // Refund totalSpend back to Spending Wallet
    const spendingWallet = getSpendingWallet();
    spendingWallet.balance += expItem.totalSpend;

    // Remove from expenses list
    state.expenses.splice(expIndex, 1);
    saveData();
    renderAll();
  }

  // ==========================================================================
  // 6. LENDING & DEBT TRACKING ENGINE
  // ==========================================================================

  function renderLendingSection() {
    renderLendingDashboard();
    renderLendingList();
  }

  function renderLendingDashboard() {
    let totalPrincipal = 0;
    let totalRepaid = 0;
    let totalOutstanding = 0;
    let expectedInterest = 0;
    let actualInterest = 0;

    state.loans.forEach(loan => {
      const p = Number(loan.principal) || 0;
      const totalPaid = Number(loan.totalPaid) || 0;
      const totalRepayable = Number(loan.totalRepayable) || p;
      const interestAmt = Number(loan.interestAmount) || 0;
      const remaining = Math.max(0, totalRepayable - totalPaid);

      totalPrincipal += p;
      totalRepaid += totalPaid;
      totalOutstanding += remaining;
      expectedInterest += interestAmt;

      // Proportional actual interest received
      if (totalRepayable > 0) {
        const interestRatio = interestAmt / totalRepayable;
        actualInterest += (totalPaid * interestRatio);
      }
    });

    setElementText('lending-total-principal', formatMoney(totalPrincipal));
    setElementText('lending-total-repaid', formatMoney(totalRepaid));
    setElementText('lending-total-outstanding', formatMoney(totalOutstanding));
    setElementText('lending-expected-interest', formatMoney(expectedInterest));
    setElementText('lending-actual-interest', formatMoney(Math.round(actualInterest)));
  }

  function renderLendingList() {
    const listContainer = document.getElementById('lending-list-container');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    if (state.loans.length === 0) {
      listContainer.innerHTML = '<div class="empty-state text-muted">ยังไม่มีรายการเงินให้ยืมในขณะนี้</div>';
      return;
    }

    state.loans.sort((a, b) => new Date(b.startDate || b.id) - new Date(a.startDate || a.id)).forEach(loan => {
      const totalPaid = Number(loan.totalPaid) || 0;
      const totalRepayable = Number(loan.totalRepayable) || loan.principal;
      const remaining = Math.max(0, totalRepayable - totalPaid);
      const percentPaid = Math.min(100, Math.round((totalPaid / totalRepayable) * 100));

      let statusBadgeHtml = '';
      if (remaining === 0 || totalPaid >= totalRepayable) {
        statusBadgeHtml = '<span class="badge-loan-status status-paid">✅ คืนครบแล้ว</span>';
      } else if (totalPaid > 0) {
        statusBadgeHtml = '<span class="badge-loan-status status-partial">🟡 กำลังชำระ</span>';
      } else {
        statusBadgeHtml = '<span class="badge-loan-status status-unpaid">🔴 ยังไม่ได้คืน</span>';
      }

      const unitText = loan.interestUnit === 'month' ? 'ต่อเดือน' : 'ต่อปี';
      const durationText = `${loan.termYears > 0 ? loan.termYears + ' ปี ' : ''}${loan.termMonths} เดือน`;

      const cardHtml = `
        <div class="loan-card-item" data-id="${loan.id}">
          <div class="loan-card-header">
            <div class="borrower-info">
              <span class="borrower-name">👤 ${escapeHtml(loan.borrowerName)}</span>
            </div>
            ${statusBadgeHtml}
          </div>

          <div class="loan-details-grid">
            <div class="detail-item">
              <span class="detail-label">เงินต้น</span>
              <span class="detail-value">${formatMoney(loan.principal)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">ดอกเบี้ย (${loan.interestRate}% ${unitText})</span>
              <span class="detail-value text-highlight blue">+${formatMoney(loan.interestAmount)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">รวมยอดต้องคืน</span>
              <span class="detail-value font-bold">${formatMoney(totalRepayable)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">ระยะเวลา (เริ่ม-กำหนดคืน)</span>
              <span class="detail-value text-muted text-xs">
                ${durationText}<br>📅 ${loan.startDate ? formatThaiDate(loan.startDate) : '-'} ถึง ${loan.dueDate ? formatThaiDate(loan.dueDate) : '-'}
              </span>
            </div>
          </div>

          <!-- Progress Bar & Payment Status -->
          <div class="loan-repayment-progress">
            <div class="progress-labels">
              <span>คืนแล้ว: <strong class="text-highlight green">${formatMoney(totalPaid)}</strong></span>
              <span>คงเหลือ: <strong class="text-highlight orange">${formatMoney(remaining)}</strong></span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill green" style="width: ${percentPaid}%;"></div>
            </div>
          </div>

          ${loan.note ? `<div class="text-xs text-muted">📝 หมายเหตุ: ${escapeHtml(loan.note)}</div>` : ''}

          <!-- Action Buttons -->
          <div class="loan-card-actions">
            ${remaining > 0 ? `<button class="btn btn-primary btn-sm btn-repay-loan" data-id="${loan.id}">🔄 บันทึกการคืนเงิน</button>` : ''}
            <button class="btn btn-subtle btn-sm btn-view-loan-history" data-id="${loan.id}">📜 ประวัติคืน (${loan.payments ? loan.payments.length : 0})</button>
            <button class="btn btn-subtle btn-sm btn-edit-loan" data-id="${loan.id}" title="แก้ไข">✏️ แก้ไข</button>
            <button class="btn btn-subtle btn-sm text-danger btn-delete-loan" data-id="${loan.id}" title="ลบ">🗑️ ลบ</button>
          </div>
        </div>
      `;
      listContainer.insertAdjacentHTML('beforeend', cardHtml);
    });

    // Attach Event Listeners to Loan Card Buttons
    listContainer.querySelectorAll('.btn-repay-loan').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const loanId = e.currentTarget.getAttribute('data-id');
        openRepaymentModal(loanId);
      });
    });

    listContainer.querySelectorAll('.btn-view-loan-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const loanId = e.currentTarget.getAttribute('data-id');
        openLoanHistoryModal(loanId);
      });
    });

    listContainer.querySelectorAll('.btn-edit-loan').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const loanId = e.currentTarget.getAttribute('data-id');
        openLoanModal(loanId);
      });
    });

    listContainer.querySelectorAll('.btn-delete-loan').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const loanId = e.currentTarget.getAttribute('data-id');
        deleteLoan(loanId);
      });
    });
  }

  function openLoanModal(loanId = null) {
    editingLoanId = loanId;
    const modalTitle = document.getElementById('loan-modal-title');
    const borrowerInput = document.getElementById('input-loan-borrower');
    const principalInput = document.getElementById('input-loan-principal');
    const rateInput = document.getElementById('input-loan-rate');
    const unitSelect = document.getElementById('select-loan-unit');
    const yearsInput = document.getElementById('input-loan-years');
    const monthsInput = document.getElementById('input-loan-months');
    const startDateInput = document.getElementById('input-loan-start-date');
    const dueDateInput = document.getElementById('input-loan-due-date');
    const walletSelect = document.getElementById('select-loan-wallet');
    const noteInput = document.getElementById('input-loan-note');

    // Populate Wallet Dropdown
    if (walletSelect) {
      walletSelect.innerHTML = '';
      state.wallets.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `${w.emoji} ${w.name} (คงเหลือ ${formatMoney(w.balance)})`;
        walletSelect.appendChild(opt);
      });
    }

    if (loanId) {
      const target = state.loans.find(l => l.id === loanId);
      if (target) {
        if (modalTitle) modalTitle.textContent = '✏️ แก้ไขรายการเงินให้ยืม';
        if (borrowerInput) borrowerInput.value = target.borrowerName;
        if (principalInput) principalInput.value = target.principal;
        if (rateInput) rateInput.value = target.interestRate;
        if (unitSelect) unitSelect.value = target.interestUnit || 'month';
        if (yearsInput) yearsInput.value = target.termYears || 0;
        if (monthsInput) monthsInput.value = target.termMonths || 0;
        if (startDateInput) startDateInput.value = target.startDate || getTodayDateString();
        if (dueDateInput) dueDateInput.value = target.dueDate || '';
        if (walletSelect) walletSelect.value = target.walletId;
        if (noteInput) noteInput.value = target.note || '';
      }
    } else {
      if (modalTitle) modalTitle.textContent = '💸 เพิ่มรายการเงินให้ยืม';
      if (borrowerInput) borrowerInput.value = '';
      if (principalInput) principalInput.value = '';
      if (rateInput) rateInput.value = '2';
      if (unitSelect) unitSelect.value = 'month';
      if (yearsInput) yearsInput.value = '0';
      if (monthsInput) monthsInput.value = '6';
      if (startDateInput) startDateInput.value = getTodayDateString();
      if (dueDateInput) dueDateInput.value = '';
      if (noteInput) noteInput.value = '';
    }

    updateLoanInterestPreview();
    openModal('modal-loan');
  }

  function updateLoanInterestPreview() {
    const principalInput = document.getElementById('input-loan-principal');
    const rateInput = document.getElementById('input-loan-rate');
    const unitSelect = document.getElementById('select-loan-unit');
    const yearsInput = document.getElementById('input-loan-years');
    const monthsInput = document.getElementById('input-loan-months');

    const p = Number(principalInput ? principalInput.value : 0) || 0;
    const r = Number(rateInput ? rateInput.value : 0) || 0;
    const u = unitSelect ? unitSelect.value : 'month';
    const y = Number(yearsInput ? yearsInput.value : 0) || 0;
    const m = Number(monthsInput ? monthsInput.value : 0) || 0;

    const calc = calculateLoanInterest(p, r, u, y, m);

    setElementText('preview-loan-interest-val', formatMoney(calc.interestAmount));
    setElementText('preview-loan-total-val', formatMoney(calc.totalRepayable));
  }

  function saveLoan() {
    const borrowerInput = document.getElementById('input-loan-borrower');
    const principalInput = document.getElementById('input-loan-principal');
    const rateInput = document.getElementById('input-loan-rate');
    const unitSelect = document.getElementById('select-loan-unit');
    const yearsInput = document.getElementById('input-loan-years');
    const monthsInput = document.getElementById('input-loan-months');
    const startDateInput = document.getElementById('input-loan-start-date');
    const dueDateInput = document.getElementById('input-loan-due-date');
    const walletSelect = document.getElementById('select-loan-wallet');
    const noteInput = document.getElementById('input-loan-note');

    const borrowerName = borrowerInput ? borrowerInput.value.trim() : '';
    const principal = Number(principalInput ? principalInput.value : 0);
    const rate = Number(rateInput ? rateInput.value : 0);
    const unit = unitSelect ? unitSelect.value : 'month';
    const years = Number(yearsInput ? yearsInput.value : 0) || 0;
    const months = Number(monthsInput ? monthsInput.value : 0) || 0;
    const startDate = (startDateInput && startDateInput.value) ? startDateInput.value : getTodayDateString();
    const dueDate = dueDateInput ? dueDateInput.value : '';
    const walletId = walletSelect ? walletSelect.value : '';
    const note = noteInput ? noteInput.value.trim() : '';

    if (!borrowerName) {
      showAlert('⚠️ กรุณากรอกชื่อผู้ยืม');
      return;
    }

    if (!principal || isNaN(principal) || principal <= 0) {
      showAlert('⚠️ กรุณากรอกจำนวนเงินต้นที่ถูกต้อง (มากกว่า 0 บาท)');
      return;
    }

    if (isNaN(rate) || rate < 0) {
      showAlert('⚠️ อัตราดอกเบี้ยต้องไม่ติดลบ');
      return;
    }

    if ((years * 12 + months) <= 0) {
      showAlert('⚠️ กรุณาระบุระยะเวลาการยืมอย่างน้อย 1 เดือนหรือ 1 ปี');
      return;
    }

    const targetWallet = state.wallets.find(w => w.id === walletId) || getSpendingWallet();
    const calc = calculateLoanInterest(principal, rate, unit, years, months);

    if (editingLoanId) {
      // Editing existing loan
      const existing = state.loans.find(l => l.id === editingLoanId);
      if (existing) {
        // Adjust Wallet Balance differences
        const oldWallet = state.wallets.find(w => w.id === existing.walletId) || targetWallet;
        
        // Revert old principal deduction
        oldWallet.balance += existing.principal;

        // Apply new principal deduction
        if (targetWallet.balance < principal) {
          // Revert back if fail
          oldWallet.balance -= existing.principal;
          showAlert(`⚠️ ยอดเงินในซอง "${targetWallet.name}" ไม่เพียงพอสำหรับการปล่อยกู้ (มีอยู่ ${formatMoney(targetWallet.balance)})`);
          return;
        }

        targetWallet.balance -= principal;

        // Update loan properties
        existing.borrowerName = borrowerName;
        existing.principal = principal;
        existing.interestRate = rate;
        existing.interestUnit = unit;
        existing.termYears = years;
        existing.termMonths = months;
        existing.startDate = startDate;
        existing.dueDate = dueDate;
        existing.walletId = targetWallet.id;
        existing.note = note;
        existing.interestAmount = calc.interestAmount;
        existing.totalRepayable = calc.totalRepayable;
      }
    } else {
      // Create new loan
      if (targetWallet.balance < principal) {
        showAlert(`⚠️ ยอดเงินในซอง "${targetWallet.name}" ไม่เพียงพอสำหรับการปล่อยกู้ (คงเหลือ ${formatMoney(targetWallet.balance)})`);
        return;
      }

      // Deduct principal strictly from chosen Wallet
      targetWallet.balance -= principal;

      const newLoan = {
        id: 'loan_' + Date.now(),
        borrowerName: borrowerName,
        principal: principal,
        interestRate: rate,
        interestUnit: unit,
        termYears: years,
        termMonths: months,
        startDate: startDate,
        dueDate: dueDate,
        walletId: targetWallet.id,
        note: note,
        interestAmount: calc.interestAmount,
        totalRepayable: calc.totalRepayable,
        totalPaid: 0,
        payments: [],
        status: 'unpaid',
        createdMonth: startDate.slice(0, 7)
      };

      state.loans.push(newLoan);
    }

    saveData();
    closeModal('modal-loan');
    renderAll();
  }

  function deleteLoan(loanId) {
    const loanIndex = state.loans.findIndex(l => l.id === loanId);
    if (loanIndex === -1) return;

    const loanItem = state.loans[loanIndex];

    if (!confirm(`⚠️ ยืนยันการลบรายการเงินให้ยืมของ "${loanItem.borrowerName}" หรือไม่?\n\nเงินต้นจะถูกคืนกลับเข้า Wallet และรายการประวัติการคืนเงินจะถูกล้าง`)) {
      return;
    }

    // Revert Wallet balances
    // 1. Return principal to source wallet
    const sourceWallet = state.wallets.find(w => w.id === loanItem.walletId) || getSpendingWallet();
    sourceWallet.balance += loanItem.principal;

    // 2. Subtract all repayment amounts credited to wallets
    if (loanItem.payments && Array.isArray(loanItem.payments)) {
      loanItem.payments.forEach(pay => {
        const payWallet = state.wallets.find(w => w.id === pay.walletId) || sourceWallet;
        payWallet.balance = Math.max(0, payWallet.balance - pay.amount);
      });
    }

    state.loans.splice(loanIndex, 1);
    saveData();
    renderAll();
  }

  // ==========================================================================
  // 7. REPAYMENT LOGIC (MULTIPLE PAYMENTS & WALLET RETURN)
  // ==========================================================================

  function openRepaymentModal(loanId) {
    activeRepaymentLoanId = loanId;
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) return;

    const borrowerDisplay = document.getElementById('display-repayment-borrower');
    const totalDisplay = document.getElementById('display-repayment-total');
    const paidDisplay = document.getElementById('display-repayment-paid');
    const remainingDisplay = document.getElementById('display-repayment-remaining');
    const amountInput = document.getElementById('input-repayment-amount');
    const dateInput = document.getElementById('input-repayment-date');
    const walletSelect = document.getElementById('select-repayment-wallet');
    const noteInput = document.getElementById('input-repayment-note');

    const totalPaid = Number(loan.totalPaid) || 0;
    const totalRepayable = Number(loan.totalRepayable) || loan.principal;
    const remaining = Math.max(0, totalRepayable - totalPaid);

    if (borrowerDisplay) borrowerDisplay.textContent = loan.borrowerName;
    if (totalDisplay) totalDisplay.textContent = formatMoney(totalRepayable);
    if (paidDisplay) paidDisplay.textContent = formatMoney(totalPaid);
    if (remainingDisplay) remainingDisplay.textContent = formatMoney(remaining);

    if (amountInput) amountInput.value = '';
    if (dateInput) dateInput.value = getTodayDateString();
    if (noteInput) noteInput.value = '';

    if (walletSelect) {
      walletSelect.innerHTML = '';
      state.wallets.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = `${w.emoji} ${w.name} (ปัจจุบัน ${formatMoney(w.balance)})`;
        walletSelect.appendChild(opt);
      });
      if (loan.walletId) walletSelect.value = loan.walletId;
    }

    openModal('modal-loan-repayment');
  }

  function saveRepayment() {
    if (!activeRepaymentLoanId) return;

    const loan = state.loans.find(l => l.id === activeRepaymentLoanId);
    if (!loan) return;

    const amountInput = document.getElementById('input-repayment-amount');
    const dateInput = document.getElementById('input-repayment-date');
    const walletSelect = document.getElementById('select-repayment-wallet');
    const noteInput = document.getElementById('input-repayment-note');

    const amount = Number(amountInput ? amountInput.value : 0);
    const dateStr = (dateInput && dateInput.value) ? dateInput.value : getTodayDateString();
    const walletId = walletSelect ? walletSelect.value : '';
    const note = noteInput ? noteInput.value.trim() : '';

    const totalPaid = Number(loan.totalPaid) || 0;
    const totalRepayable = Number(loan.totalRepayable) || loan.principal;
    const remaining = Math.max(0, totalRepayable - totalPaid);

    if (!amount || isNaN(amount) || amount <= 0) {
      showAlert('⚠️ กรุณากรอกจำนวนเงินที่คืนให้ถูกต้อง (มากกว่า 0 บาท)');
      return;
    }

    if (amount > remaining) {
      showAlert(`⚠️ ยอดเงินที่คืน (${formatMoney(amount)}) มากกว่ายอดคงเหลือที่ต้องคืน (${formatMoney(remaining)})`);
      return;
    }

    const targetWallet = state.wallets.find(w => w.id === walletId) || getSpendingWallet();

    // Add repaid amount back to target Wallet
    targetWallet.balance += amount;

    // Record Payment
    if (!loan.payments) loan.payments = [];

    const newPayment = {
      id: 'pay_' + Date.now(),
      amount: amount,
      date: dateStr,
      walletId: targetWallet.id,
      walletName: targetWallet.name,
      note: note
    };

    loan.payments.push(newPayment);

    // Recalculate totals and status
    loan.totalPaid = loan.payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const newRemaining = Math.max(0, loan.totalRepayable - loan.totalPaid);
    if (newRemaining === 0) {
      loan.status = 'paid';
    } else {
      loan.status = 'partial';
    }

    saveData();
    closeModal('modal-loan-repayment');
    renderAll();
  }

  function openLoanHistoryModal(loanId) {
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) return;

    setElementText('display-history-borrower', `👤 ${loan.borrowerName}`);
    setElementText('display-history-summary', `ยอดกู้: ${formatMoney(loan.totalRepayable)} | คืนแล้ว: ${formatMoney(loan.totalPaid)}`);

    const container = document.getElementById('loan-history-list-container');
    if (!container) return;

    container.innerHTML = '';
    if (!loan.payments || loan.payments.length === 0) {
      container.innerHTML = '<div class="empty-state text-muted">ยังไม่มีประวัติการคืนเงิน</div>';
    } else {
      loan.payments.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(pay => {
        const itemHtml = `
          <div class="history-item">
            <div class="item-main-info">
              <span class="item-title">💰 คืนเงิน: ${formatMoney(pay.amount)}</span>
              <div class="item-meta">
                <span>📅 ${formatThaiDate(pay.date)}</span>
                <span>เข้าซอง: ${escapeHtml(pay.walletName || 'ซองเงิน')}</span>
                ${pay.note ? `<span>📝 ${escapeHtml(pay.note)}</span>` : ''}
              </div>
            </div>
            <div class="item-amount-action">
              <button class="btn-delete-item-pay text-danger" data-loan-id="${loan.id}" data-pay-id="${pay.id}" title="ลบรายการคืนนี้">
                🗑️
              </button>
            </div>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHtml);
      });

      // Bind delete repayment listeners
      container.querySelectorAll('.btn-delete-item-pay').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const lId = e.currentTarget.getAttribute('data-loan-id');
          const pId = e.currentTarget.getAttribute('data-pay-id');
          deleteRepayment(lId, pId);
        });
      });
    }

    openModal('modal-loan-history');
  }

  function deleteRepayment(loanId, paymentId) {
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan || !loan.payments) return;

    const payIndex = loan.payments.findIndex(p => p.id === paymentId);
    if (payIndex === -1) return;

    const payItem = loan.payments[payIndex];

    // Deduct payment amount from wallet
    const targetWallet = state.wallets.find(w => w.id === payItem.walletId) || getSpendingWallet();
    targetWallet.balance = Math.max(0, targetWallet.balance - payItem.amount);

    loan.payments.splice(payIndex, 1);
    loan.totalPaid = loan.payments.reduce((sum, p) => sum + Number(p.amount), 0);

    if (loan.totalPaid === 0) {
      loan.status = 'unpaid';
    } else if (loan.totalPaid < loan.totalRepayable) {
      loan.status = 'partial';
    }

    saveData();
    renderAll();
    openLoanHistoryModal(loanId); // Refresh history modal view
  }

  // ==========================================================================
  // 8. WALLET MANAGEMENT & PERCENTAGE RULES
  // ==========================================================================

  function validateWalletPercentages(walletsList) {
    const totalPct = walletsList.reduce((sum, w) => sum + (Number(w.percent) || 0), 0);
    if (totalPct > 100) {
      return {
        valid: false,
        total: totalPct,
        message: `⚠️ เปอร์เซ็นต์รวมเกิน 100% (ปัจจุบัน: ${totalPct}%)`
      };
    }
    return {
      valid: true,
      total: totalPct,
      unallocated: 100 - totalPct
    };
  }

  function saveWalletSettings() {
    const validation = validateWalletPercentages(state.wallets);
    if (!validation.valid) {
      showAlert(validation.message);
      return;
    }

    saveData();
    renderDashboard();
    renderChart();
    renderWalletSettingsList();
    showAlert('✅ บันทึกการตั้งค่าซองเงินเรียบร้อยแล้ว');
  }

  function openWalletModal(walletId = null) {
    editingWalletId = walletId;
    const modalTitle = document.getElementById('wallet-modal-title');
    const emojiInput = document.getElementById('input-wallet-emoji');
    const nameInput = document.getElementById('input-wallet-name');
    const percentInput = document.getElementById('input-wallet-percent');

    if (walletId) {
      const target = state.wallets.find(w => w.id === walletId);
      if (target) {
        if (modalTitle) modalTitle.textContent = '⚙️ แก้ไขซองเงิน';
        if (emojiInput) emojiInput.value = target.emoji;
        if (nameInput) nameInput.value = target.name;
        if (percentInput) percentInput.value = target.percent;
      }
    } else {
      if (modalTitle) modalTitle.textContent = '⚙️ เพิ่มซองเงินใหม่';
      if (emojiInput) emojiInput.value = '💰';
      if (nameInput) nameInput.value = '';
      if (percentInput) percentInput.value = '5';
    }

    openModal('modal-wallet-edit');
  }

  function saveWalletItem() {
    const emojiInput = document.getElementById('input-wallet-emoji');
    const nameInput = document.getElementById('input-wallet-name');
    const percentInput = document.getElementById('input-wallet-percent');

    const emoji = (emojiInput && emojiInput.value.trim()) ? emojiInput.value.trim() : '💰';
    const name = nameInput ? nameInput.value.trim() : '';
    const percent = Number(percentInput ? percentInput.value : 0) || 0;

    if (!name) {
      showAlert('⚠️ กรุณากรอกชื่อซองเงิน');
      return;
    }

    if (percent < 0 || percent > 100) {
      showAlert('⚠️ กรุณากรอกเปอร์เซ็นต์ระหว่าง 0 ถึง 100%');
      return;
    }

    if (editingWalletId) {
      const target = state.wallets.find(w => w.id === editingWalletId);
      if (target) {
        target.emoji = emoji;
        target.name = name;
        target.percent = percent;
      }
    } else {
      // Limit check: Max 6 wallets
      if (state.wallets.length >= 6) {
        showAlert('⚠️ สามารถสร้างซองเงินได้สูงสุด 6 ใบเท่านั้น');
        return;
      }

      const newWallet = {
        id: 'wallet_' + Date.now(),
        name: name,
        emoji: emoji,
        percent: percent,
        type: 'custom',
        balance: 0
      };
      state.wallets.push(newWallet);
    }

    // Validate total percentage before closing
    const validation = validateWalletPercentages(state.wallets);
    if (!validation.valid) {
      showAlert(validation.message);
      return;
    }

    saveData();
    closeModal('modal-wallet-edit');
    renderAll();
  }

  function deleteWallet(walletId) {
    if (state.wallets.length <= 3) {
      showAlert('⚠️ ต้องมีซองเงินอย่างน้อย 3 ใบในระบบ');
      return;
    }

    const index = state.wallets.findIndex(w => w.id === walletId);
    if (index !== -1) {
      state.wallets.splice(index, 1);
      saveData();
      renderAll();
    }
  }

  function renderWalletSettingsList() {
    const container = document.getElementById('wallet-settings-list');
    const totalPercentEl = document.getElementById('display-total-wallet-percent');
    const unallocatedBadgeEl = document.getElementById('unallocated-percent-badge');

    if (!container) return;

    container.innerHTML = '';
    let totalPercent = 0;

    state.wallets.forEach(w => {
      totalPercent += Number(w.percent) || 0;
      const rowHtml = `
        <div class="wallet-setting-row" data-id="${w.id}">
          <div class="wallet-setting-left">
            <span class="wallet-emoji">${w.emoji}</span>
            <span class="wallet-name">${escapeHtml(w.name)}</span>
          </div>
          <div class="wallet-setting-inputs">
            <input type="number" class="form-control input-percent-sm wallet-percent-input" data-id="${w.id}" value="${w.percent}" min="0" max="100">
            <span>%</span>
            <button class="btn-icon-text btn-edit-wallet" data-id="${w.id}" title="แก้ไขชื่อ/Emoji">✏️</button>
            ${state.wallets.length > 3 ? `<button class="btn-icon-text text-danger btn-remove-wallet" data-id="${w.id}" title="ลบซอง">🗑️</button>` : ''}
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', rowHtml);
    });

    if (totalPercentEl) {
      totalPercentEl.textContent = `${totalPercent}%`;
    }

    if (unallocatedBadgeEl) {
      if (totalPercent < 100) {
        unallocatedBadgeEl.textContent = `(เหลือ ${100 - totalPercent}% ยังไม่ได้จัดสรร)`;
      } else {
        unallocatedBadgeEl.textContent = '';
      }
    }

    // Attach listeners
    container.querySelectorAll('.wallet-percent-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        const newPct = Number(e.target.value) || 0;
        const targetWallet = state.wallets.find(w => w.id === id);
        if (targetWallet) {
          targetWallet.percent = newPct;
          renderWalletSettingsList();
          renderDashboard();
        }
      });
    });

    container.querySelectorAll('.btn-edit-wallet').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openWalletModal(id);
      });
    });

    container.querySelectorAll('.btn-remove-wallet').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        deleteWallet(id);
      });
    });
  }

  // ==========================================================================
  // 9. GOAL & RESET MODAL OPERATORS
  // ==========================================================================

  function openGoalModal() {
    const goalInput = document.getElementById('input-goal-amount');
    if (goalInput) {
      goalInput.value = state.savingGoal || 30000;
    }
    openModal('modal-goal');
  }

  function saveGoal() {
    const goalInput = document.getElementById('input-goal-amount');
    const val = Number(goalInput ? goalInput.value : 0);
    if (!val || val <= 0) {
      showAlert('⚠️ กรุณากรอกจำนวนเงินเป้าหมายที่ถูกต้อง');
      return;
    }

    state.savingGoal = val;
    saveData();
    closeModal('modal-goal');
    renderGoalCard();
  }

  function openResetModal() {
    const step1 = document.getElementById('reset-step-1');
    const step2 = document.getElementById('reset-step-2');
    if (step1) step1.classList.remove('hidden');
    if (step2) step2.classList.add('hidden');
    openModal('modal-reset');
  }

  function executeDataReset() {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  // ==========================================================================
  // 10. MODAL WINDOW MANAGER & ALERT SYSTEM
  // ==========================================================================

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  }

  function showAlert(msg) {
    const msgEl = document.getElementById('alert-message');
    if (msgEl) msgEl.innerText = msg;
    openModal('modal-alert');
  }

  function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setStyleWidth(id, widthStr) {
    const el = document.getElementById(id);
    if (el) el.style.width = widthStr;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // 11. EVENT BINDINGS
  // ==========================================================================

  function bindEvents() {
    // Header & Reset
    document.getElementById('btn-reset-app')?.addEventListener('click', openResetModal);

    // Month Comparison Toggle
    document.getElementById('btn-toggle-month-compare')?.addEventListener('click', () => {
      const panel = document.getElementById('month-comparison-panel');
      if (panel) {
        panel.classList.toggle('hidden');
      }
    });

    // Month Navigation
    document.getElementById('btn-prev-month')?.addEventListener('click', () => {
      const [yyyy, mm] = state.currentMonth.split('-').map(Number);
      const date = new Date(yyyy, mm - 2, 1);
      state.currentMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      renderAll();
    });

    document.getElementById('btn-next-month')?.addEventListener('click', () => {
      const [yyyy, mm] = state.currentMonth.split('-').map(Number);
      const date = new Date(yyyy, mm, 1);
      state.currentMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      renderAll();
    });

    document.getElementById('btn-current-month')?.addEventListener('click', () => {
      state.currentMonth = getTodayMonthString();
      renderAll();
    });

    // Primary Action Triggers
    document.getElementById('btn-open-income-wizard')?.addEventListener('click', openIncomeWizard);
    document.getElementById('btn-open-expense-modal')?.addEventListener('click', openExpenseModal);
    document.getElementById('btn-edit-goal')?.addEventListener('click', openGoalModal);

    // Wizard Controls
    document.getElementById('btn-close-income-wizard')?.addEventListener('click', () => closeModal('modal-income-wizard'));
    document.getElementById('btn-wizard-cancel-1')?.addEventListener('click', () => closeModal('modal-income-wizard'));
    
    document.getElementById('btn-add-custom-source')?.addEventListener('click', () => {
      const input = document.getElementById('input-custom-source');
      const val = input ? input.value.trim() : '';
      if (val) {
        wizardSelectedSource = val;
        renderIncomeSourcesChips();
        input.value = '';
      }
    });

    document.getElementById('btn-wizard-next-1')?.addEventListener('click', () => {
      if (!wizardSelectedSource) {
        showAlert('⚠️ กรุณาเลือกหรือระบุแหล่งรายได้');
        return;
      }
      showWizardPage(2);
    });

    document.getElementById('btn-wizard-back-2')?.addEventListener('click', () => showWizardPage(1));
    document.getElementById('btn-wizard-confirm')?.addEventListener('click', confirmAddIncome);

    document.getElementById('input-income-amount')?.addEventListener('input', updateWizardAllocationPreview);

    // Expense Modal Controls
    document.getElementById('btn-close-expense-modal')?.addEventListener('click', () => closeModal('modal-expense'));
    document.getElementById('btn-cancel-expense')?.addEventListener('click', () => closeModal('modal-expense'));
    document.getElementById('btn-save-expense')?.addEventListener('click', saveExpense);

    document.getElementById('input-expense-amount')?.addEventListener('input', updateSelfTaxPreview);
    document.getElementById('checkbox-self-tax')?.addEventListener('change', updateSelfTaxPreview);

    // Lending Controls & Event Bindings
    document.getElementById('btn-open-loan-modal')?.addEventListener('click', () => openLoanModal(null));
    document.getElementById('btn-close-loan-modal')?.addEventListener('click', () => closeModal('modal-loan'));
    document.getElementById('btn-cancel-loan')?.addEventListener('click', () => closeModal('modal-loan'));
    document.getElementById('btn-save-loan')?.addEventListener('click', saveLoan);

    // Real-time Interest Preview Listeners
    ['input-loan-principal', 'input-loan-rate', 'select-loan-unit', 'input-loan-years', 'input-loan-months'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateLoanInterestPreview);
      document.getElementById(id)?.addEventListener('change', updateLoanInterestPreview);
    });

    // Repayment Modal Controls
    document.getElementById('btn-close-repayment-modal')?.addEventListener('click', () => closeModal('modal-loan-repayment'));
    document.getElementById('btn-cancel-repayment')?.addEventListener('click', () => closeModal('modal-loan-repayment'));
    document.getElementById('btn-save-repayment')?.addEventListener('click', saveRepayment);

    // History Modal Controls
    document.getElementById('btn-close-loan-history-modal')?.addEventListener('click', () => closeModal('modal-loan-history'));
    document.getElementById('btn-close-history-ok')?.addEventListener('click', () => closeModal('modal-loan-history'));

    // Goal Modal Controls
    document.getElementById('btn-close-goal-modal')?.addEventListener('click', () => closeModal('modal-goal'));
    document.getElementById('btn-cancel-goal')?.addEventListener('click', () => closeModal('modal-goal'));
    document.getElementById('btn-save-goal')?.addEventListener('click', saveGoal);

    // Wallet Edit Controls
    document.getElementById('btn-add-wallet')?.addEventListener('click', () => openWalletModal(null));
    document.getElementById('btn-save-wallet-settings')?.addEventListener('click', saveWalletSettings);
    document.getElementById('btn-close-wallet-modal')?.addEventListener('click', () => closeModal('modal-wallet-edit'));
    document.getElementById('btn-cancel-wallet')?.addEventListener('click', () => closeModal('modal-wallet-edit'));
    document.getElementById('btn-save-wallet-item')?.addEventListener('click', saveWalletItem);

    // Alert Dialog Controls
    document.getElementById('btn-alert-ok')?.addEventListener('click', () => closeModal('modal-alert'));

    // Reset Modal Controls
    document.getElementById('btn-close-reset-modal')?.addEventListener('click', () => closeModal('modal-reset'));
    document.getElementById('btn-reset-cancel')?.addEventListener('click', () => closeModal('modal-reset'));
    document.getElementById('btn-reset-proceed-step2')?.addEventListener('click', () => {
      const step1 = document.getElementById('reset-step-1');
      const step2 = document.getElementById('reset-step-2');
      if (step1) step1.classList.add('hidden');
      if (step2) step2.classList.remove('hidden');
    });
    document.getElementById('btn-reset-cancel-2')?.addEventListener('click', () => closeModal('modal-reset'));
    document.getElementById('btn-reset-final-confirm')?.addEventListener('click', executeDataReset);
  }

  // --- Bootstrap App ---
  document.addEventListener('DOMContentLoaded', initApp);

})();
