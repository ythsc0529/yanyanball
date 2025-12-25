import { auth, logout } from './auth';
import { db } from './firebase';
import { vocabularyDatabase } from './data';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Countdown } from './utils/countdown.js';

console.log("App.js loaded v4");

// State
let currentUser = null;
let currentView = 'vocabulary';
let displayedWords = [];
let starredWords = new Set(JSON.parse(localStorage.getItem('starredWords') || '[]'));
let masteredWords = new Set(JSON.parse(localStorage.getItem('masteredWords') || '[]'));
const EXAM_DATE = '2026-01-17T09:00:00';
const ITEMS_PER_PAGE = 20;
let currentPage = 1;

// Definition Cache
const cachedDefinitions = JSON.parse(localStorage.getItem('cachedDefinitions') || '{}');
// Merge cache on load
vocabularyDatabase.forEach(w => {
    if (cachedDefinitions[w.word]) {
        w.definition = cachedDefinitions[w.word];
    }
});

async function translateWord(word) {
    if (cachedDefinitions[word]) return cachedDefinitions[word];
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(word)}`);
        const json = await res.json();
        if (json && json[0] && json[0][0] && json[0][0][0]) {
            const def = json[0][0][0];
            cachedDefinitions[word] = def;
            localStorage.setItem('cachedDefinitions', JSON.stringify(cachedDefinitions));
            return def;
        }
    } catch (e) {
        console.error("Trans err:", e);
    }
    return "沒有釋義";
}

// Quiz/Placement State
let quizState = {
    active: false,
    questions: [],
    index: 0,
    score: 0,
    type: 'quiz', // 'quiz' or 'placement'
    incorrectWords: []
};

// DOM Elements
const elements = {
    wordList: document.getElementById('word-list'),
    searchInput: document.getElementById('search-input'),
    sortSelect: document.getElementById('sort-select'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    logoutBtn: document.getElementById('logout-btn'),
    vipLink: document.getElementById('vip-link'),
    mainView: document.getElementById('main-view'),
    modal: document.getElementById('word-modal'),
    modalBody: document.getElementById('modal-body'),
    closeModal: document.querySelector('.close-modal')
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    try {
        const countdown = new Countdown(EXAM_DATE, 'sidebar-countdown');
        countdown.start();
        const mobileCountdown = new Countdown(EXAM_DATE, 'mobile-countdown');
        mobileCountdown.start();
    } catch (e) { console.error("Countdown init error", e); }

    checkAuth();
    loadStarredWords();

    // Initial Render
    displayedWords = [...vocabularyDatabase];
    renderPaginationList();

    setupEventListeners();
    updateStreak();

    // Notification Check Loop (Every minute)
    setInterval(() => {
        const enabled = localStorage.getItem('notifyEnabled') === 'true';
        if (!enabled) return;

        const time = localStorage.getItem('notifyTime') || '20:00';
        const now = new Date();
        const currentHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const lastDate = localStorage.getItem('lastNotificationDate');
        const todayStr = now.toDateString();

        if (currentHM === time && lastDate !== todayStr) {
            new Notification("雁雁球學習提醒", {
                body: "該學習囉！今天還沒背單字嗎？",
                icon: '/yanyan_mascot_logo.png'
            });
            localStorage.setItem('lastNotificationDate', todayStr);
        }
    }, 60000); // Check every 60s
});

function checkAuth() {
    const isGuest = localStorage.getItem('guestMode') === 'true';
    if (isGuest) {
        currentUser = { displayName: '訪客', isAnonymous: true };
        updateUIForUser(currentUser);
    } else {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                updateUIForUser(user);
                startCloudSync(user.uid);
            } else {
                window.location.href = '/index.html';
            }
        });
    }
}

let unsubscribeCloudSync = null;
function startCloudSync(uid) {
    if (unsubscribeCloudSync) unsubscribeCloudSync();

    const userDocRef = doc(db, 'users', uid);
    unsubscribeCloudSync = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.starredWords) {
                starredWords = new Set(data.starredWords);
                localStorage.setItem('starredWords', JSON.stringify([...starredWords]));

                // Refresh current view if it's the stars view
                const activeLink = document.querySelector('.nav-link.active, .bottom-nav-item.active');
                if (activeLink && activeLink.dataset.view === 'stars') {
                    handleNavigation('stars');
                }
            }
        }
    });
}

function updateUIForUser(user) {
    if (user.displayName) {
        if (elements.userName) elements.userName.textContent = user.displayName;
        if (elements.userAvatar) elements.userAvatar.textContent = user.displayName[0].toUpperCase();

        // Update Mobile Header User Info
        const mobileUserInfo = document.getElementById('mobile-user-info');
        if (mobileUserInfo) mobileUserInfo.textContent = user.displayName;
    }
    if (user.isAnonymous && elements.vipLink) {
        elements.vipLink.style.opacity = '0.5';
        elements.vipLink.querySelector('span').nextSibling.textContent = ' 雁雁球學習 (限會員)';
        elements.vipLink.style.pointerEvents = 'none';
        elements.vipLink.title = "請登入以使用此功能";
    }
}

function setupEventListeners() {
    // Search & Sort interaction
    if (elements.searchInput) elements.searchInput.addEventListener('input', updateList);
    if (elements.sortSelect) elements.sortSelect.addEventListener('change', updateList);
    const levelFilter = document.getElementById('level-filter');
    if (levelFilter) levelFilter.addEventListener('change', updateList);

    const sortOrderBtn = document.getElementById('sort-order-btn');
    let isAscending = true;
    if (sortOrderBtn) {
        sortOrderBtn.addEventListener('click', () => {
            isAscending = !isAscending;
            sortOrderBtn.textContent = isAscending ? '⬇️' : '⬆️';
            updateList();
        });
    }

    // Logout
    const logoutAction = async () => {
        if (currentUser?.isAnonymous) localStorage.removeItem('guestMode');
        else await logout();
        window.location.href = '/index.html';
    };

    if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', logoutAction);

    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', logoutAction);

    // Navigation (Desktop Sidebar & Mobile Bottom Nav)
    document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = e.currentTarget.dataset.view;
            quizState.active = false; // Reset quiz state when navigating

            // Update active states for all navigation items
            document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(l => {
                if (l.dataset.view === view) l.classList.add('active');
                else l.classList.remove('active');
            });

            handleNavigation(view);
        });
    });

    // Modal Close
    if (elements.closeModal) elements.closeModal.addEventListener('click', closeModal);
    if (elements.modal) {
        elements.modal.addEventListener('click', (e) => {
            if (e.target === elements.modal) closeModal();
        });
    }

    // User Profile Click (Desktop)
    const userName = document.getElementById('user-name');
    if (userName) {
        userName.addEventListener('click', () => {
            document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(l => l.classList.remove('active'));
            handleNavigation('profile');
        });
    }

    // User Profile Click (Mobile Header)
    const mobileUserInfo = document.getElementById('mobile-user-info');
    if (mobileUserInfo) {
        mobileUserInfo.style.cursor = 'pointer';
        mobileUserInfo.addEventListener('click', () => {
            document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(l => l.classList.remove('active'));
            handleNavigation('profile');
        });
    }
}

function updateList() {
    if (!elements.searchInput || !elements.sortSelect) return;
    const query = elements.searchInput.value.toLowerCase().trim();
    const sort = elements.sortSelect.value;
    const levelStr = document.getElementById('level-filter')?.value || 'all';
    const isAscending = document.getElementById('sort-order-btn')?.textContent.includes('⬇️') ?? true;

    // Helper for fuzzy search - handling simple variations
    const normalize = (w) => {
        if (w.length <= 3) return w;
        if (w.endsWith('s')) return w.slice(0, -1);
        if (w.endsWith('ed')) return w.slice(0, -2);
        if (w.endsWith('ing')) return w.slice(0, -3);
        return w;
    };
    const normQuery = normalize(query);

    let filtered = vocabularyDatabase.filter(item => {
        // Level Filter
        if (levelStr !== 'all' && item.level !== parseInt(levelStr)) return false;

        // Search Filter
        if (!query) return true;

        const wordLower = item.word.toLowerCase();
        const def = (item.definition || '').toLowerCase();

        // Exact match has highest priority (handled by sorting implicitly if strict match)
        // Check standard includes
        if (wordLower.includes(query) || def.includes(query)) return true;

        // Check variations
        const normWord = normalize(wordLower);
        if (normWord.includes(normQuery)) return true; // e.g. "play" matches "playing" (norm: "play")

        return false;
    });

    // Sorting
    filtered.sort((a, b) => {
        let valA, valB;
        if (sort === 'alpha') {
            valA = a.word.toLowerCase();
            valB = b.word.toLowerCase();
            return isAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sort === 'frequency') {
            valA = a.frequency || 0;
            valB = b.frequency || 0;
            // Frequency: usually high freq #1 is better? Let's assume user wants high freq first usually.
            // If Ascending (Arrow Down implies top-down 1..N): 1 is bigger? 
            // Usually "Frequency" sort means Most Frequent First.
            // Let's standard: 
            // Ascending (⬇️): High to Low? Or A->Z?
            // "Ascending" usually means 0->9, A->Z.
            // "Descending" usually means 9->0, Z->A.
            // For Frequency: "High Frequency" usually means smaller rank number if 1 is best, or larger count.
            // Assuming data has 'frequency' as a rank (1 = most common).
            // So Ascending (1->100) = Most frequent first.
            return isAscending ? (valA - valB) : (valB - valA);
        } else if (sort === 'level') {
            valA = a.level || 0;
            valB = b.level || 0;
            return isAscending ? (valA - valB) : (valB - valA);
        }
    });

    displayedWords = filtered;
    currentPage = 1;
    renderPaginationList();
}

// Logout
const logoutAction = async () => {
    if (currentUser?.isAnonymous) localStorage.removeItem('guestMode');
    else await logout();
    window.location.href = '/index.html';
};

if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', logoutAction);

const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', logoutAction);

// Navigation (Desktop Sidebar & Mobile Bottom Nav)
document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = e.currentTarget.dataset.view;
        quizState.active = false; // Reset quiz state when navigating

        // Update active states for all navigation items
        document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(l => {
            if (l.dataset.view === view) l.classList.add('active');
            else l.classList.remove('active');
        });

        handleNavigation(view);
    });
});

// Modal Close
if (elements.closeModal) elements.closeModal.addEventListener('click', closeModal);
if (elements.modal) {
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });
}

// User Profile Click (Desktop)
const userName = document.getElementById('user-name');
if (userName) {
    userName.addEventListener('click', () => {
        document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(l => l.classList.remove('active'));
        handleNavigation('profile');
    });
}

// User Profile Click (Mobile Header)
const mobileUserInfo = document.getElementById('mobile-user-info');
if (mobileUserInfo) {
    mobileUserInfo.style.cursor = 'pointer';
    mobileUserInfo.addEventListener('click', () => {
        document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(l => l.classList.remove('active'));
        handleNavigation('profile');
    });
}
}

function updateList() {
    if (!elements.searchInput || !elements.sortSelect) return;
    const query = elements.searchInput.value.toLowerCase();
    const sort = elements.sortSelect.value;

    let filtered = vocabularyDatabase.filter(item =>
        item.word.toLowerCase().includes(query) ||
        (item.definition || '').includes(query)
    );

    if (sort === 'alpha') filtered.sort((a, b) => a.word.localeCompare(b.word));
    else if (sort === 'frequency') filtered.sort((a, b) => b.frequency - a.frequency);
    else if (sort === 'level') filtered.sort((a, b) => b.level - a.level);

    displayedWords = filtered;
    currentPage = 1;
    renderPaginationList();
}

function handleNavigation(view) {
    const title = document.querySelector('h2');
    elements.wordList.innerHTML = '';
    elements.wordList.className = ''; // Reset classes

    // Toggle Search Bar Visibility
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) searchContainer.style.display = (view === 'vocabulary') ? 'flex' : 'none';

    // Remove pagination when not in vocabulary or stars view
    const oldPag = document.getElementById('pagination-ctrl');
    if (oldPag && view !== 'vocabulary' && view !== 'stars') oldPag.remove();

    if (view === 'vocabulary') {
        title.textContent = '7000 單字庫';
        updateList();
    }
    else if (view === 'stars') {
        title.textContent = '星號單字本';
        const starry = vocabularyDatabase.filter(w => starredWords.has(w.id));
        displayedWords = starry;
        currentPage = 1;
        renderPaginationList();
    }
    else if (view === 'quiz') {
        title.textContent = '測驗區';
        renderQuizOptions();
    }
    else if (view === 'learning') {
        title.textContent = '雁雁球學習';
        checkPlacementTest();
    }
    else if (view === 'profile') {
        title.textContent = '個人主頁';
        renderProfile();
    }
}

// ================= RENDER LIST & PAGINATION =================

function renderPaginationList() {
    if (!elements.wordList) return;
    elements.wordList.innerHTML = '';
    elements.wordList.classList.add('word-grid');

    if (displayedWords.length === 0) {
        elements.wordList.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#999; margin-top:50px;">沒有找到單字，趕快去學習吧！</div>';
        return;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = displayedWords.slice(start, end);

    pageItems.forEach((item, index) => {
        const card = createCard(item);
        card.style.animationDelay = `${index * 0.05}s`;
        elements.wordList.appendChild(card);
    });

    // Pagination Controls
    const oldPag = document.getElementById('pagination-ctrl');
    if (oldPag) oldPag.remove();

    if (displayedWords.length > ITEMS_PER_PAGE) {
        const pagContainer = document.createElement('div');
        pagContainer.id = 'pagination-ctrl';
        pagContainer.className = 'pagination';
        pagContainer.style.gridColumn = "1/-1";

        const totalPages = Math.ceil(displayedWords.length / ITEMS_PER_PAGE);

        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '&lt;';
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderPaginationList(); window.scrollTo(0, 0); } };

        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '&gt;';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderPaginationList(); window.scrollTo(0, 0); } };

        const info = document.createElement('span');
        info.style.alignSelf = "center";
        info.textContent = `第 ${currentPage} 頁 / 共 ${totalPages} 頁`;

        pagContainer.appendChild(prevBtn);
        pagContainer.appendChild(info);
        pagContainer.appendChild(nextBtn);
        elements.wordList.parentNode.appendChild(pagContainer);
    }
}

function createCard(item) {
    const isStarred = starredWords.has(item.id);
    const card = document.createElement('div');
    card.className = 'word-card';
    card.onclick = (e) => {
        if (e.target.closest('.icon-btn')) return;
        openModal(item);
    };

    const hasDef = item.definition && item.definition !== '(暫無釋義)' && item.definition !== '暫無釋義' && item.definition !== '沒有釋義';
    const displayDef = hasDef ? item.definition : '載入中...';

    card.innerHTML = `
        <div class="word-head">
            <span class="en-word">${item.word}</span>
            <span class="pos-tag">L${item.level}</span>
        </div>
        <div class="zh-def" id="def-${item.id}">${item.pos} ${displayDef}</div>
        <div class="card-actions">
            <button class="icon-btn sound" onclick="window.speak('${item.word}')">🔊</button>
            <button class="icon-btn star ${isStarred ? 'active' : ''}" data-id="${item.id}">
                ${isStarred ? '★' : '☆'}
            </button>
        </div>
    `;

    if (!hasDef) {
        translateWord(item.word).then(def => {
            item.definition = def;
            const el = card.querySelector(`#def-${item.id}`);
            if (el) el.innerHTML = `${item.pos} ${def}`;
        });
    }

    const starBtn = card.querySelector('.star');
    starBtn.onclick = (e) => {
        e.stopPropagation();
        toggleStar(item.id);
    };

    const soundBtn = card.querySelector('.sound');
    soundBtn.onclick = (e) => {
        e.stopPropagation();
        window.speak(item.word);
    };

    return card;
}

// ================= MODAL =================

function openModal(item) {
    const isStarred = starredWords.has(item.id);
    const hasDef = item.definition && item.definition !== '(暫無釋義)' && item.definition !== '暫無釋義' && item.definition !== '沒有釋義';

    // Auto translate if missing
    if (!hasDef) {
        translateWord(item.word).then(def => {
            item.definition = def;
            const el = document.getElementById('modal-def-content');
            if (el) el.innerText = def;
        });
    }

    // TRACK LEARNING (Daily Log)
    const today = new Date().toISOString().split('T')[0];
    const dailyLog = JSON.parse(localStorage.getItem('dailyLearningLog') || '{}');
    if (!dailyLog[today]) dailyLog[today] = [];
    if (!dailyLog[today].includes(item.id)) {
        dailyLog[today].push(item.id);
        localStorage.setItem('dailyLearningLog', JSON.stringify(dailyLog));
    }

    elements.modalBody.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <h2 style="font-size:3rem; color:var(--color-primary); margin-bottom:10px;">${item.word}</h2>
            <div style="font-size:1.2rem; color:#666;">
                <span class="pos-tag" style="background:#eee; padding:2px 8px; border-radius:4px; margin-right:8px;">${item.pos}</span> 
                Level ${item.level}
                <div id="modal-def-text" style="font-weight:500; margin-top:8px; font-size:1.4rem; color:#333;">
                    <span id="modal-def-content">${hasDef ? item.definition : '載入解釋中...'}</span>
                </div>
            </div>
        </div>
        
        <div style="background:#f8f9fa; padding:20px; border-radius:12px; margin-bottom:20px;">
            <h4 style="color:var(--color-text-muted); font-size:0.9rem; text-transform:uppercase; margin-bottom:8px;">例句</h4>
            <div style="font-size:1.1rem; font-style:italic; color:#333;">"${item.sentence || ''}"</div>
        </div>

        <div style="display:flex; justify-content:center; gap:20px; margin-top:30px;">
            <button class="btn btn-secondary" onclick="window.speak('${item.word}')">🔊 發音</button>
            <button class="btn ${isStarred ? 'btn-primary' : 'btn-secondary'}" onclick="window.toggleStarAndRefreshModal('${item.id}', this)">
                ${isStarred ? '★ 已收藏' : '☆ 收藏'}
            </button>
        </div>
    `;
    elements.modal.classList.add('open');
}

function closeModal() {
    elements.modal.classList.remove('open');
}

window.toggleStarAndRefreshModal = (id, btn) => {
    toggleStar(id);
    const has = starredWords.has(id);
    btn.innerHTML = has ? '★ 已收藏' : '☆ 收藏';
    btn.className = `btn ${has ? 'btn-primary' : 'btn-secondary'}`;
};

// ================= QUIZ & LEARNING =================

function renderQuizOptions() {
    const hasStarredWords = starredWords.size > 0;

    elements.wordList.innerHTML = `
        <div class="quiz-options-grid">
            <div class="quiz-option-card">
                <div class="quiz-icon">📚</div>
                <h3>7000單隨機測驗</h3>
                <p>從全部單字中隨機抽取 10 題</p>
                <button class="btn btn-primary" onclick="startQuizMode('all')">開始測驗</button>
            </div>
            
            ${hasStarredWords ? `
            <div class="quiz-option-card">
                <div class="quiz-icon">⭐</div>
                <h3>星號單字測驗</h3>
                <p>從已收藏的 ${starredWords.size} 個單字中測驗</p>
                <button class="btn btn-primary" onclick="startQuizMode('starred')">開始測驗</button>
            </div>
            ` : ''}
            
            <div class="quiz-option-card">
                <div class="quiz-icon">🎯</div>
                <h3>自選級數測驗</h3>
                <p>選擇特定級別進行測驗</p>
                <div style="margin: 16px 0;">
                    <select id="level-select" class="level-selector">
                        <option value="1">Level 1</option>
                        <option value="2">Level 2</option>
                        <option value="3">Level 3</option>
                        <option value="4">Level 4</option>
                        <option value="5">Level 5</option>
                        <option value="6">Level 6</option>
                    </select>
                </div>
                <button class="btn btn-primary" onclick="startQuizMode('level')">開始測驗</button>
            </div>
        </div>
    `;
}

window.startQuizMode = (mode) => {
    if (currentUser && currentUser.isAnonymous) {
        alert("請登入以使用此功能！");
        return;
    }
    let pool = [];

    if (mode === 'all') {
        pool = [...vocabularyDatabase];
    } else if (mode === 'starred') {
        pool = vocabularyDatabase.filter(w => starredWords.has(w.id));
        if (pool.length < 4) {
            alert('星號單字不足 4 個，無法進行測驗！');
            return;
        }
    } else if (mode === 'level') {
        const selectedLevel = parseInt(document.getElementById('level-select').value);
        pool = vocabularyDatabase.filter(w => w.level === selectedLevel);
        if (pool.length < 4) {
            alert('該級別單字不足，無法進行測驗！');
            return;
        }
    }

    startQuiz('quiz', pool);
};

window.startRetest = () => {
    if (quizState.incorrectWords.length === 0) return;
    const pool = [...quizState.incorrectWords];
    startQuiz('quiz', pool);
};

window.starIncorrectWords = () => {
    if (quizState.incorrectWords.length === 0) return;
    quizState.incorrectWords.forEach(w => {
        starredWords.add(w.id);
    });
    localStorage.setItem('starredWords', JSON.stringify([...starredWords]));
    alert('已將錯誤單字全部加入收藏！');
    handleNavigation('quiz'); // Refresh view
};

function checkPlacementTest() {
    if (currentUser && currentUser.isAnonymous) {
        elements.wordList.innerHTML = `
            <div class="quiz-container">
                <div class="quiz-card">
                    <h3>訪客無法使用學習功能</h3>
                    <p style="color:#666; margin:20px 0;">請登入以建立您的專屬學習計畫。</p>
                </div>
            </div>
        `;
        return;
    }
    const hasTaken = localStorage.getItem('placementTestResult');
    if (!hasTaken) {
        renderPlacementIntro();
    } else {
        renderLearningDashboard(JSON.parse(hasTaken));
    }
}

function renderPlacementIntro() {
    elements.wordList.innerHTML = `
        <div class="quiz-container">
            <div class="quiz-card">
                <h3>歡迎來到雁雁球學習！</h3>
                <p style="color:#666; margin:20px 0;">初次使用需進行分級測試，以為您安排專屬計畫。</p>
                <div style="text-align:left; background:#f8f9fa; padding:20px; border-radius:10px; margin-bottom:20px;">
                    <strong>測驗內容：</strong> 5 題單字選擇<br>
                    <strong>預估時間：</strong> 1 分鐘
                </div>
                <button class="btn btn-primary" onclick="startQuiz('placement')">開始分級測試</button>
            </div>
        </div>
    `;
}

window.handleNavigation = handleNavigation;

window.startQuiz = (type, customPool = null) => {
    quizState.type = type;
    quizState.active = true;
    quizState.index = 0;
    quizState.score = 0;
    quizState.incorrectWords = [];

    let pool = customPool || [...vocabularyDatabase];
    let qCount = 5;

    if (type === 'quiz') qCount = 10;

    let selected = [];
    if (type === 'placement') {
        qCount = 5;
        for (let i = 0; i < qCount; i++) {
            if (pool.length === 0) break;
            let idx = Math.floor(Math.random() * pool.length);
            selected.push(pool.splice(idx, 1)[0]);
        }
    } else {
        for (let i = 0; i < qCount; i++) {
            if (pool.length === 0) break;
            let idx = Math.floor(Math.random() * pool.length);
            selected.push(pool.splice(idx, 1)[0]);
        }
    }

    quizState.questions = selected.map(target => {
        const others = vocabularyDatabase.filter(w => w.id !== target.id);
        others.sort(() => Math.random() - 0.5);
        const options = [target.definition, others[0]?.definition, others[1]?.definition, others[2]?.definition];
        options.sort(() => Math.random() - 0.5);
        return { target, options, correct: target.definition };
    });

    renderQuestion();
};

function renderQuestion() {
    if (!quizState.active) return;
    if (quizState.index >= quizState.questions.length) {
        finishQuiz();
        return;
    }

    const q = quizState.questions[quizState.index];
    const total = quizState.questions.length;
    const title = quizState.type === 'placement' ? '分級測試' : '隨機測驗';

    elements.wordList.innerHTML = `
        <div class="quiz-container">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
                <span style="font-weight:bold;">${title}</span>
                <span style="color:#999;">${quizState.index + 1} / ${total}</span>
            </div>
            
            <div class="quiz-card">
                <h2 style="font-size:clamp(1.5rem, 8vw, 2.5rem); margin-bottom:30px; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.2;">${q.target.word}</h2>
                <div class="quiz-options">
                    ${q.options.map(opt => `<button class="option-btn" onclick="submitAnswer(this, '${opt}', '${q.correct}')">${opt}</button>`).join('')}
                    <button class="option-btn not-sure" onclick="submitAnswer(this, 'DONT_KNOW', '${q.correct}')">不知道 (I don't know)</button>
                </div>
                
                <div style="margin-top:30px; border-top:1px solid #eee; padding-top:20px;">
                    <button class="btn btn-secondary" onclick="stopQuiz()">⛔ 停止測驗</button>
                </div>
            </div>
        </div>
    `;
}

window.submitAnswer = (btn, selected, correct) => {
    const allBtns = document.querySelectorAll('.option-btn');
    allBtns.forEach(b => b.style.pointerEvents = 'none');

    const currentQ = quizState.questions[quizState.index];

    if (selected === correct) {
        btn.classList.add('correct');
        quizState.score++;

        // Unstar if in Starred mode
        if (quizState.type === 'starred') {
            if (confirm(`恭喜答對！要將 "${currentQ.target.word}" 移出星號清單嗎？`)) {
                toggleStar(currentQ.target.id);
            }
        }

        // Add to mastered words if correct in non-placement quiz
        if (quizState.type !== 'placement') {
            masteredWords.add(currentQ.target.id);
            localStorage.setItem('masteredWords', JSON.stringify([...masteredWords]));
        }
        window.speak(currentQ.target.word);
    } else {
        btn.classList.add('wrong');
        allBtns.forEach(b => {
            if (b.textContent === correct) b.classList.add('correct');
        });

        // Track incorrect word (avoid duplicates)
        if (!quizState.incorrectWords.some(w => w.id === currentQ.target.id)) {
            quizState.incorrectWords.push(currentQ.target);
        }

        window.speak('Wrong');

        // Re-insert question later (Immediate Retry Logic)
        // Insert at index + 3 or end of array
        if (quizState.type !== 'placement') {
            const reInsertIndex = Math.min(quizState.index + 3, quizState.questions.length);
            // Deep copy to avoid reference issues if mutable (though here objects are ref, which is fine)
            // We want to re-ask the exact same question structure
            quizState.questions.splice(reInsertIndex, 0, currentQ);
        }
    }

    setTimeout(() => {
        if (quizState.active) {
            quizState.index++;
            renderQuestion();
        }
    }, 1500);
};

window.stopQuiz = () => {
    if (confirm("確定要中止測驗嗎？目前的進度將不會保存。")) {
        quizState.active = false;
        if (quizState.type === 'placement') handleNavigation('learning');
        else handleNavigation('quiz');
    }
};

function finishQuiz() {
    quizState.active = false;

    if (quizState.type === 'placement') {
        let levelName = '基礎 (Beginner)';
        if (quizState.score === 5) levelName = '精通 (Master)';
        else if (quizState.score >= 3) levelName = '進階 (Advanced)';

        const result = { level: levelName, score: quizState.score, date: new Date().toISOString() };
        localStorage.setItem('placementTestResult', JSON.stringify(result));
        renderLearningDashboard(result);
    } else {
        const hasErrors = quizState.incorrectWords.length > 0;
        elements.wordList.innerHTML = `
            <div class="quiz-container">
                <div class="quiz-card">
                    <h3>測驗完成！</h3>
                    <div style="font-size:4rem; font-weight:800; color:var(--color-primary); margin:20px 0;">
                        ${quizState.score} / ${quizState.questions.length}
                    </div>
                    
                    ${hasErrors ? `
                        <div style="margin-bottom:20px; text-align:left; background:#fff5f5; padding:20px; border-radius:12px; border:1px solid #fed7d7;">
                            <h4 style="color:#c53030; margin-bottom:10px;">需要複習的單字：</h4>
                            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px;">
                                ${quizState.incorrectWords.map(w => `<span style="background:white; padding:4px 10px; border-radius:20px; border:1px solid #feb2b2; font-size:0.9rem;">${w.word}</span>`).join('')}
                            </div>
                            <p style="font-size:0.9rem; color:#744210;">💡 系統建議將這些單字加入<b>星號收藏</b>以加強記憶。</p>
                            <button class="btn btn-primary" style="width:100%; margin-top:10px; background:var(--color-warning);" onclick="starIncorrectWords()">⭐ 一鍵加入收藏</button>
                            <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="startRetest()">🔄 立即重測錯誤單字</button>
                        </div>
                    ` : ''}

                    <div style="display:flex; justify-content:center; gap:10px;">
                        <button class="btn btn-secondary" onclick="startQuiz('quiz')">重新開始隨機測驗</button>
                        <button class="btn btn-primary" onclick="handleNavigation('vocabulary')">回到單字庫</button>
                    </div>
                </div>
            </div>
        `;
    }
}

function renderLearningDashboard(result) {
    const today = new Date().toISOString().split('T')[0];
    const dailyLog = JSON.parse(localStorage.getItem('dailyLearningLog') || '{}');
    const todayLearnedCount = (dailyLog[today] || []).length;

    // Check if daily review is done
    const dailyReviewDone = localStorage.getItem(`dailyReviewDone_${today}`);

    elements.wordList.innerHTML = `
        <div class="quiz-container">
             <div class="quiz-card" style="text-align:left; background: linear-gradient(135deg, #ffffff 0%, #f0f4ff 100%);">
                <div style="text-align:center; margin-bottom:30px;">
                    <h3 style="margin-bottom:10px; font-size:1.8rem;">我的學習路徑</h3>
                    <div style="color:#666;">當前等級: <span class="pos-tag" style="background:var(--color-primary); color:white;">${result.level}</span></div>
                </div>

                <!-- Daily Progress Circle -->
                <div style="display:flex; justify-content:center; margin-bottom:40px;">
                    <div style="position:relative; width:150px; height:150px; border-radius:50%; border:8px solid #eee; display:flex; align-items:center; justify-content:center; flex-direction:column;">
                        <svg style="position:absolute; top:-8px; left:-8px; width:150px; height:150px; transform:rotate(-90deg);">
                            <circle cx="75" cy="75" r="70" fill="none" stroke="var(--color-primary)" stroke-width="8" 
                                stroke-dasharray="440" stroke-dashoffset="${440 - (todayLearnedCount / 10 * 440)}" stroke-linecap="round" />
                        </svg>
                        <div style="font-size:2.5rem; font-weight:bold; color:var(--color-primary);">${todayLearnedCount}</div>
                        <div style="font-size:0.8rem; color:#999;">今日單字</div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div style="display:grid; gap:16px; margin-bottom:30px;">
                     <div style="background:white; padding:20px; border-radius:16px; box-shadow:0 4px 15px rgba(0,0,0,0.05); display:flex; align-items:center; justify-content:space-between;">
                        <div>
                            <h4 style="margin-bottom:4px;">今日單字測驗</h4>
                            <p style="font-size:0.9rem; color:#666; margin:0;">複習今天看過的所有單字</p>
                        </div>
                        <button class="btn ${todayLearnedCount < 4 ? 'btn-secondary' : 'btn-primary'}" 
                            onclick="startQuizMode('daily')" 
                            ${todayLearnedCount < 4 ? 'disabled title="至少需學習4個單字"' : ''}>
                            ${dailyReviewDone ? '✅ 已完成' : '📝 開始測驗'}
                        </button>
                     </div>

                     <div style="background:white; padding:20px; border-radius:16px; box-shadow:0 4px 15px rgba(0,0,0,0.05); display:flex; align-items:center; justify-content:space-between;">
                        <div>
                            <h4 style="margin-bottom:4px;">繼續學習</h4>
                            <p style="font-size:0.9rem; color:#666; margin:0;">探索更多 ${result.level} 單字</p>
                        </div>
                        <button class="btn btn-primary" onclick="handleNavigation('vocabulary')">🚀 前往單字庫</button>
                     </div>
                </div>

                <!-- Stats -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="background:white; padding:15px; border-radius:12px; text-align:center;">
                        <div style="font-size:2rem;">🔥</div>
                        <div style="font-weight:bold; font-size:1.2rem;">${localStorage.getItem('streak') || 0} 天</div>
                        <div style="font-size:0.8rem; color:#999;">連續打卡</div>
                    </div>
                    <div style="background:white; padding:15px; border-radius:12px; text-align:center;">
                        <div style="font-size:2rem;">🏆</div>
                        <div style="font-weight:bold; font-size:1.2rem;">${masteredWords.size}</div>
                        <div style="font-size:0.8rem; color:#999;">已精通單字</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getPersonalizedWords(levelName) {
    let targetLevels = [1, 2]; // Default Beginner
    if (levelName.includes('Advanced') || levelName.includes('精通')) targetLevels = [5, 6];
    else if (levelName.includes('Intermediate') || levelName.includes('進階')) targetLevels = [3, 4];

    let pool = vocabularyDatabase.filter(w => targetLevels.includes(w.level));
    if (pool.length < 3) pool = vocabularyDatabase;

    const selected = [];
    for (let i = 0; i < 3; i++) {
        if (pool.length === 0) break;
        const idx = Math.floor(Math.random() * pool.length);
        const item = pool.splice(idx, 1)[0];
        // Auto fetch
        if (!item.definition || item.definition === '(暫無釋義)' || item.definition === '沒有釋義') {
            translateWord(item.word).then(def => {
                item.definition = def;
            });
        }
        selected.push(item);
    }
    return selected;
}

// ================= UTIL =================

window.speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    speechSynthesis.speak(utterance);
};

function loadStarredWords() {
    const stored = localStorage.getItem('starredWords');
    if (stored) {
        starredWords = new Set(JSON.parse(stored));
    }
}


// Expose functions to global scope for inline handlers
window.openModal = openModal;
window.checkPlacementTest = checkPlacementTest;
window.toggleStar = toggleStar;
window.startQuiz = startQuiz;
window.startRetest = startRetest;
window.starIncorrectWords = starIncorrectWords;
window.handleNavigation = handleNavigation;

function toggleStar(id) {
    if (starredWords.has(id)) starredWords.delete(id);
    else starredWords.add(id);

    // Save to LocalStorage immediately for responsiveness
    localStorage.setItem('starredWords', JSON.stringify([...starredWords]));

    // Sync to Cloud if logged in
    if (currentUser && !currentUser.isAnonymous) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        setDoc(userDocRef, { starredWords: [...starredWords] }, { merge: true })
            .catch(err => console.error("Cloud sync failed:", err));
    }

    // Update UI
    const btns = document.querySelectorAll(`.icon-btn.star[data-id="${id}"]`);
    btns.forEach(btn => {
        btn.innerHTML = starredWords.has(id) ? '★' : '☆';
        btn.classList.toggle('active', starredWords.has(id));
    });

    const activeLink = document.querySelector('.nav-link.active, .bottom-nav-item.active');
    if (activeLink && activeLink.dataset.view === 'stars') {
        const starry = vocabularyDatabase.filter(w => starredWords.has(w.id));
        displayedWords = starry;
        currentPage = 1;
        renderPaginationList();
    }
}

// ================= STREAK LOGIC =================
function updateStreak() {
    const now = new Date();
    const todayStr = now.toDateString();
    let streakData = JSON.parse(localStorage.getItem('streakData') || '{"count":0, "lastDate":"", "max":0}');

    if (streakData.lastDate === todayStr) return;

    const lastDate = streakData.lastDate ? new Date(streakData.lastDate) : null;
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    if (lastDate && lastDate.toDateString() === yesterday.toDateString()) {
        streakData.count++;
    } else {
        streakData.count = 1;
    }

    streakData.lastDate = todayStr;
    if (streakData.count > streakData.max) streakData.max = streakData.count;

    localStorage.setItem('streakData', JSON.stringify(streakData));
}

// ================= PROFILE PAGE =================

function renderProfile() {
    const isGuest = currentUser?.isAnonymous;
    const joinDate = localStorage.getItem('userJoinDate') || new Date().toISOString();

    // Calculate vocabulary level based on starred words
    const estimatedVocabulary = calculateVocabularyLevel();

    if (isGuest) {
        elements.wordList.innerHTML = `
            <div class="profile-container">
                <div class="profile-card guest-card">
                    <div class="guest-icon">👤</div>
                    <h3>訪客模式</h3>
                    <p style="color: #666; margin: 20px 0;">使用 Google 登入以保存您的學習進度和記錄</p>
                    <button class="btn btn-primary" onclick="window.location.href='/index.html'">使用 Google 登入</button>
                </div>
            </div>
        `;
    } else {
        // Calculate days since joining
        const daysSinceJoin = Math.floor((new Date() - new Date(joinDate)) / (1000 * 60 * 60 * 24));

        elements.wordList.innerHTML = `
            <div class="profile-container">
                <div class="profile-header">
                    <div class="profile-avatar">${currentUser.displayName[0].toUpperCase()}</div>
                    <div>
                        <h2 style="margin: 0;">${currentUser.displayName}</h2>
                        <p style="color: #666; margin: 4px 0;">加入 ${daysSinceJoin} 天</p>
                    </div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">🔥</div>
                        <div class="stat-value">${JSON.parse(localStorage.getItem('streakData') || '{"count":0}').count}</div>
                        <div class="stat-label">連續天數</div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-icon">🏆</div>
                        <div class="stat-value">${JSON.parse(localStorage.getItem('streakData') || '{"max":0}').max}</div>
                        <div class="stat-label">最高紀錄</div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-icon">📊</div>
                        <div class="stat-value">${estimatedVocabulary}</div>
                        <div class="stat-label">預估單字量</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">⭐</div>
                        <div class="stat-value">${starredWords.size}</div>
                        <div class="stat-label">收藏單字</div>
                    </div>
                </div>
                
                <div class="info-card">
                    <h3>學習建議</h3>
                    <p>${getLearningAdvice()}</p>
                </div>

                <div class="info-card" style="margin-top: 16px;">
                    <h3>每日提醒設定</h3>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:10px;">
                        <span style="color:#666;">開啟通知:</span>
                        <label class="switch">
                            <input type="checkbox" id="notify-toggle" ${localStorage.getItem('notifyEnabled') === 'true' ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div id="notify-time-container" style="display:${localStorage.getItem('notifyEnabled') === 'true' ? 'flex' : 'none'}; align-items:center; justify-content:space-between; margin-top:10px;">
                        <span style="color:#666;">提醒時間:</span>
                        <input type="time" id="notify-time" value="${localStorage.getItem('notifyTime') || '20:00'}" style="padding:4px; border:1px solid #ddd; border-radius:4px;">
                    </div>
                    <div style="font-size:0.8rem; color:#999; margin-top:8px;">* 需保持網頁開啟才能收到通知</div>
                </div>
            </div>
        `;

        // Bind Notification Events
        setTimeout(() => {
            const toggle = document.getElementById('notify-toggle');
            const timeInput = document.getElementById('notify-time');
            const timeContainer = document.getElementById('notify-time-container');

            if (toggle) {
                toggle.addEventListener('change', async (e) => {
                    const enabled = e.target.checked;
                    if (enabled) {
                        const permission = await Notification.requestPermission();
                        if (permission === 'granted') {
                            localStorage.setItem('notifyEnabled', 'true');
                            timeContainer.style.display = 'flex';
                            new Notification('通知已開啟', { body: '我們將在每天指定時間提醒您學習！' });
                        } else {
                            alert('請允許通知權限以使用此功能');
                            e.target.checked = false;
                        }
                    } else {
                        localStorage.setItem('notifyEnabled', 'false');
                        timeContainer.style.display = 'none';
                    }
                });
            }

            if (timeInput) {
                timeInput.addEventListener('change', (e) => {
                    localStorage.setItem('notifyTime', e.target.value);
                });
            }
        }, 100);
    }
}

function calculateVocabularyLevel() {
    const placement = JSON.parse(localStorage.getItem('placementTestResult') || 'null');
    let base = 0;
    if (placement) {
        if (placement.level.includes('Master')) base = 5000;
        else if (placement.level.includes('Advanced')) base = 3000;
        else base = 1000;
    }

    // Add mastered words (words answered correctly in quizzes)
    const uniqueMastered = masteredWords.size;

    return base + uniqueMastered;
}

function calculateProgress() {
    const knownWords = calculateVocabularyLevel();
    return Math.round((knownWords / vocabularyDatabase.length) * 100);
}

function getLearningAdvice() {
    const progress = calculateProgress();
    if (progress < 30) {
        return '🎯 建議從 Level 1-2 的基礎單字開始，打好基礎！每天記 10-20 個單字，穩扎穩打。';
    } else if (progress < 60) {
        return '💪 進度不錯！繼續加強 Level 3-4 的單字，並定期複習已學過的內容。';
    } else if (progress < 85) {
        return '🚀 很棒的進度！現在可以挑戰 Level 5-6 的進階單字，距離完全掌握 7000 單不遠了！';
    } else {
        return '🎉 太厲害了！您已經掌握大部分單字，繼續保持複習，準備迎接學測！';
    }
}

// Initialize join date on first load
if (!localStorage.getItem('userJoinDate')) {
    localStorage.setItem('userJoinDate', new Date().toISOString());
}
