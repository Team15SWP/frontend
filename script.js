if (sessionStorage.getItem('pp_uiStarted')) {
  document.documentElement.classList.add('pp-skip-home'); 
}
document.addEventListener('DOMContentLoaded', () => {
  const homepage     = document.getElementById('homepage');
  const startChatBtn = document.getElementById('start-chat-btn');
  const topBar       = document.querySelector('.top-bar');
  const layoutBox    = document.querySelector('.layout');
  const adminBanner  = document.getElementById('admin-banner');
  const suError = document.getElementById('su-error');

  topBar.classList.add('hidden');
  layoutBox.classList.add('hidden');
  adminBanner.classList.add('hidden');

  const showChatUi = () => {
    // Always open chat UI, no login check here!
    homepage.classList.add('animate-out');
    homepage.addEventListener('animationend', () => {
      homepage.classList.add('hidden');
      homepage.classList.remove('animate-out');
      sessionStorage.setItem('pp_uiStarted', '1');
      topBar.classList.remove('hidden');
      topBar.classList.add('animate-in');
      layoutBox.classList.remove('hidden');
      layoutBox.classList.add('animate-in');
      if (!adminBanner.classList.contains('hidden'))
        adminBanner.classList.add('animate-in');
      [topBar, layoutBox, adminBanner].forEach(el =>
        el.addEventListener('animationend', () => el.classList.remove('animate-in'), { once: true })
      );
    }, { once: true });
  };
  if (startChatBtn) startChatBtn.addEventListener('click', showChatUi);

  const messagesBox = document.getElementById('messages');
  const diffBox = document.getElementById('difficulty-buttons');
  const quoteBlock = document.querySelector('.quote');
  const userInput = document.getElementById('user-input');
  const submitCodeBtn = document.getElementById('submit-code-btn');
  const hintBtn = document.getElementById('hint-btn');
  const hintHelp = document.getElementById('hint-help');
  const hintWrapper = document.querySelector('.hint-wrapper');
  const topicsList = document.getElementById('topics-list');

  const loginBtn   = document.getElementById('login-btn');
  const loginModal = document.getElementById('login-modal');
  const modalClose = document.getElementById('modal-close');
  const userTab    = document.getElementById('user-tab');
  const adminTab   = document.getElementById('admin-tab');

  const loginForm  = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const goSignup   = document.getElementById('go-signup');
  const goLogin    = document.getElementById('go-login');
  const loginError = document.getElementById('login-error');

  const adminForm  = document.getElementById('admin-form');
  const adminAttemptsInfo = document.getElementById('admin-attempts');

  const profileDiv = document.getElementById('profile');
  const userNameSp = document.getElementById('user-name');
  const logoutBtn  = document.getElementById('logout-btn');

  const uploadBtn  = document.getElementById('upload-syllabus-btn');
  const fileInput  = document.getElementById('syllabus-file');

  const scoreBtn    = document.getElementById('score-btn');
  const scoreCntSp  = document.getElementById('score-count');
  const scoreModal  = document.getElementById('score-modal');
  const scoreClose  = document.getElementById('score-close');
  const scoreText   = document.getElementById('score-text');

  let solvedCount = 0;
  const chats          = {};   // { topicKey: [outerHTML,…] }
  const lastTasks      = {};   // { topicKey: rawTaskJSON }
  const lastDifficulty = {};   // { topicKey: 'beginner' | 'medium' | 'hard' }

  let currentTopicKey  = null; // snake_case ключ выбранной темы
  let attemptMade = false;

  const scoreKey = () => 'pp_solved_' + (userNameSp.textContent || 'anon');

  const loadScore = async () => {
    try {
      const token = localStorage.getItem('pp_token');
      if (!token) {
        console.log('No token found, setting score to 0');
        solvedCount = 0;
        updateScoreDisplay();
        return;
      }

      console.log('Fetching score from backend...');
      const res = await fetch(apiUrl('/get_stats'), {
        headers: getAuthHeaders()
      });
      
      console.log('Score response status:', res.status);
      
      if (res.ok) {
        const stats = await res.json();
        console.log('Backend stats received:', stats);
        const oldScore = solvedCount;
        solvedCount = stats.total || 0;
        console.log(`Score updated: ${oldScore} → ${solvedCount}`);
        updateScoreDisplay();
      } else {
        console.error('Failed to load score from backend, status:', res.status);
        solvedCount = 0;
        updateScoreDisplay();
      }
    } catch (err) {
      console.error('Error loading score:', err);
      solvedCount = 0;
      updateScoreDisplay();
    }
  };
  
  // Remove saveScore function since backend handles score updates
  // const saveScore = () => localStorage.setItem(scoreKey(), solvedCount);

  const updateScoreDisplay = () => {
    console.log('Updating score display, current score:', solvedCount);
    scoreCntSp.textContent = solvedCount;
    scoreText.textContent  =
      `You have solved ${solvedCount} task${solvedCount === 1 ? '' : 's'} 🎉`;
    console.log('Score display updated');
  };

  scoreBtn.addEventListener('click', () => {
    updateScoreDisplay();
    scoreModal.classList.remove('hidden');
  });
  scoreClose.addEventListener('click',
    () => scoreModal.classList.add('hidden'));

  let clearBtn = null;

  let selectedTopic = null;
  let currentDifficulty = null;
  let currentTaskRaw    = '';
  let isAdmin           = false;
  let syllabusLoaded    = false;
  let diffPromptMsg     = null;
  const submittingTopics = new Set(); // Track loading state per topic
  const disabledTopics = new Set(); // Track which topics have disabled inputs
  const generatingTasks = new Set(); // Track task generation state per topic
  const topicHints = {}; // { topicKey: { hints: [...], count: number } }
  let currentlyGeneratingTopic = null; // Track which topic is currently generating

  profileDiv.style.display = 'none';
  logoutBtn.style.display  = 'none';
  userInput.disabled       = true;
  submitCodeBtn.disabled   = true;
  hintBtn.disabled         = true;
  topicsList.innerHTML     = '';
  topicsList.style.display = 'none';

  // Restore login state from localStorage
  const restoreLoginState = async () => {
    const isLoggedIn = localStorage.getItem('pp_loggedIn') === 'true';
    if (isLoggedIn) {
      const userName = localStorage.getItem('pp_userName') || 'User';
      const isAdmin = localStorage.getItem('pp_isAdmin') === 'true';
      await finishLogin(userName, isAdmin);
    }
  };

  const noTopicsMsg = document.createElement('div');
  noTopicsMsg.textContent = '⏳ Please wait until the administrator uploads the syllabus 😔';
  noTopicsMsg.style.cssText = 'color:#999;text-align:center;margin-top:16px;font-size:14px;';
  topicsList.parentNode.insertBefore(noTopicsMsg, topicsList.nextSibling);

  const hideQuote = () => quoteBlock && (quoteBlock.style.display = 'none');

  const showMessage = (text, role = 'bot') => {
  const div = document.createElement('div');
  div.className  = `message ${role}`;
  div.textContent = text;
  messagesBox.appendChild(div);
  messagesBox.scrollTop = messagesBox.scrollHeight;

  if (currentTopicKey) {               // тема уже выбрана
    if (!chats[currentTopicKey]) chats[currentTopicKey] = [];
    chats[currentTopicKey].push(div.outerHTML);
  }
  return div;
  };

  const pushToChat = (text, role, topicKey) => {
  if (!chats[topicKey]) chats[topicKey] = [];
  const div = document.createElement('div');
  div.className  = `message ${role}`;
  div.textContent = text;
  chats[topicKey].push(div.outerHTML);

  if (topicKey === currentTopicKey) {          // чат открыт
    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }
  };

  const pushUserCode = (code, topicKey) => {
  const div = document.createElement('div');
  div.className = 'message user';
  const pre = document.createElement('pre');
  pre.textContent = code;
  div.appendChild(pre);

  if (!chats[topicKey]) chats[topicKey] = [];
  chats[topicKey].push(div.outerHTML);

  if (topicKey === currentTopicKey) {
    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }
  };


  const makeWaitingNotice = txt => {
    const node = showMessage(txt, 'bot');
    return () => node.remove();
  };
  const showCodeMessage = code => {
    const d = document.createElement('div');
    d.className = 'message user';
    const p = document.createElement('pre');
    p.textContent = code;
    d.appendChild(p);
    messagesBox.appendChild(d);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  const fetchEval = async (url, opts={}) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };

  // Helper function to create authenticated fetch options
  const getAuthHeaders = (includeAuth = true) => {
    const headers = { 'Content-Type': 'application/json' };
    if (includeAuth) {
      const token = localStorage.getItem('pp_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  };

  // Helper function to validate session and refresh if needed
  const validateSession = async () => {
    const token = localStorage.getItem('pp_token');
    if (!token) {
      return false;
    }
    
    try {
      const res = await fetch(apiUrl('/get_stats'), {
        headers: getAuthHeaders()
      });
      
      if (res.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('pp_token');
        localStorage.removeItem('pp_loggedIn');
        localStorage.removeItem('pp_userName');
        localStorage.removeItem('pp_isAdmin');
        return false;
      }
      
      return res.ok;
    } catch (err) {
      console.error('Session validation error:', err);
      return false;
    }
  };

  const updateTopicList = arr => {
    syllabusLoaded = arr.length > 0;
    topicsList.innerHTML = '';

    // Get current admin status from localStorage to ensure it's correct
    const currentIsAdmin = localStorage.getItem('pp_isAdmin') === 'true';

    if (!syllabusLoaded) {
      topicsList.style.display  = 'none';
      noTopicsMsg.style.display = currentIsAdmin ? 'none' : 'block';
      userInput.disabled        = true;
      submitCodeBtn.disabled    = true;
      selectedTopic             = null;

      if (currentIsAdmin) {
        uploadBtn.style.display  = 'block';
        if (clearBtn) clearBtn.style.display = 'none';
      }
      return;
    }

    topicsList.style.display  = 'block';
    noTopicsMsg.style.display = 'none';
    userInput.disabled        = false;
    submitCodeBtn.disabled    = false;
    diffBox.style.display      = 'flex';

    arr.forEach(t => {
      const li = document.createElement('li');
      li.textContent = t.trim();
      topicsList.appendChild(li);
      li.addEventListener('click', () => handleTopic(li));
    });

    if (currentIsAdmin) {
      if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.id          = 'clear-syllabus-btn';
        clearBtn.className   = 'upload-btn';
        clearBtn.textContent = 'Clear syllabus';
        clearBtn.style.marginTop = '6px';
        clearBtn.addEventListener('click', clearSyllabus);
        uploadBtn.parentNode.insertBefore(clearBtn, uploadBtn.nextSibling);
      }
      clearBtn.style.display  = 'block';
      uploadBtn.style.display = 'none';
    }
  };
  function clearChat() {
    messagesBox.innerHTML = '';
    taskShown = false;
    answerSent = false;
    hintBtn.disabled = true;
    if (quoteBlock) quoteBlock.style.display = 'none';
  }

  const updateInputStates = () => {
    console.log('updateInputStates called, currentTopicKey:', currentTopicKey);
    
    if (!currentTopicKey) {
      console.log('No currentTopicKey, keeping inputs in default state');
      return;
    }
    
    const hasTask = Boolean(lastTasks[currentTopicKey]);
    
    // Simplified: only disable submit button if no task
    submitCodeBtn.disabled = !hasTask;
    userInput.disabled = false; // Always allow typing
    
    console.log(`Topic: ${currentTopicKey}, hasTask: ${hasTask}, submitBtn disabled: ${!hasTask}`);
  };

  const handleTopic = li => {
  // Check if user is logged in before allowing topic selection
  const isLoggedIn = localStorage.getItem('pp_loggedIn') === 'true';
  if (!isLoggedIn) {
    showMessage('❗️ Please log in to use the bot', 'bot');
    openModal();
    return;
  }
  
  if (!syllabusLoaded) return;
  hideQuote();
  li.classList.remove('has-new');

  /* 1. подчёркиваем активную тему */
  document.querySelectorAll('.sidebar li')
          .forEach(e => e.classList.remove('active-topic'));
  li.classList.add('active-topic');

  /* 2. сохраняем DOM-историю прежней темы */
  if (currentTopicKey) {
    chats[currentTopicKey] = Array.from(
      messagesBox.children,
      el => el.outerHTML
    );
  }

  /* 3. вычисляем новый ключ */
  selectedTopic   = li.textContent.trim();
  currentTopicKey = selectedTopic.toLowerCase().replace(/\s+/g, '_');

  /* 4. вытаскиваем кэш-данные */
  currentDifficulty = lastDifficulty[currentTopicKey] ?? null;
  currentTaskRaw    = lastTasks[currentTopicKey]    ?? '';
  hintBtn.disabled  = !currentTaskRaw;
  submitCodeBtn.disabled = !currentTaskRaw;
  diffBox.style.display  = 'flex';
  /* 5. восстанавливаем или очищаем чат */
  messagesBox.innerHTML = '';
  if (chats[currentTopicKey]) {
    messagesBox.innerHTML = chats[currentTopicKey].join('');
    messagesBox.scrollTop = messagesBox.scrollHeight;
  } else {
    showMessage(selectedTopic, 'user');
    if (!currentTaskRaw)
      diffPromptMsg = showMessage('Select difficulty 👇', 'bot');
  }

  // Check if this topic was generating and re-enable buttons if needed
  if (currentlyGeneratingTopic === currentTopicKey) {
    const difficultyButtons = document.querySelectorAll('#difficulty-buttons button');
    difficultyButtons.forEach(btn => btn.disabled = true);
    console.log('Buttons remain disabled for topic that is generating');
  } else {
    const difficultyButtons = document.querySelectorAll('#difficulty-buttons button');
    difficultyButtons.forEach(btn => btn.disabled = false);
    console.log('Buttons enabled for topic that is not generating');
  }

  const hasTask = Boolean(lastTasks[currentTopicKey]);

  submitCodeBtn.disabled = !hasTask;   // разрешаем «Send code», если задача есть
  hintBtn.disabled       = !hasTask;   // то же для «Hint»
  diffBox.style.display  = 'flex';  // изменила здесь

  updateInputStates();
  };

  // Function to fetch syllabus with authentication
  const fetchSyllabus = async () => {
    const token = localStorage.getItem('pp_token');
    if (!token) return;

    try {
      const res = await fetch(apiUrl('/get_syllabus'), {
        headers: getAuthHeaders()
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.topics)) {
          updateTopicList(data.topics);
        }
      }
    } catch (err) {
      console.log('Error fetching syllabus:', err);
    }
  };

  const clearSyllabus = () => {
    updateTopicList([]);
    diffBox.style.display = 'flex';

    fileInput.value = '';

    fetch(apiUrl('/delete_syllabus'), { 
      method: 'DELETE',
      headers: getAuthHeaders()
    }).catch(()=>{});

    alert('Syllabus cleared');
  };

  const openModal  = () => loginModal.classList.remove('hidden');
  const closeModal = () => loginModal.classList.add('hidden');
  loginBtn.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);

  userTab.addEventListener('click', () => {
    userTab.classList.add('active');
    loginForm.classList.remove('hidden'); 
    signupForm.classList.add('hidden');
  });
  goSignup.addEventListener('click', () => {
    loginForm.classList.add('hidden'); signupForm.classList.remove('hidden');
    loginError.textContent = '';
  });
  goLogin.addEventListener('click', () => {
    signupForm.classList.add('hidden'); loginForm.classList.remove('hidden');
    loginError.textContent = '';
  });
  const validateSignup = (name, email, pwd) => {
    const reName  = /^[a-zA-Z][a-zA-Z0-9_]{2,15}$/;
    const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!reName.test(name))  return 'Nickname must be 3-16 latin letters/digits';
    if (!reEmail.test(email)) return 'Invalid e-mail format';
    if (pwd.length < 9)      return 'Password must be ≥ 9 chars';
    if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/\d/.test(pwd))
      return 'Password needs upper, lower & digit';
    return '';
  };

  const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', ''];
  const isLocal         = LOCAL_HOSTNAMES.includes(location.hostname);
  const getUsers        = () => JSON.parse(localStorage.getItem('pp_users') || '[]');
  const saveUsers       = users => localStorage.setItem('pp_users', JSON.stringify(users));
  const errorBox        = suError || loginError;
  const showSuErr       = msg => { if (errorBox) errorBox.textContent = msg; };

  signupForm.addEventListener('submit', async e => {
    e.preventDefault();

    const name  = document.getElementById('su-name').value.trim();
    const email = document.getElementById('su-email').value.trim();
    const pwd   = document.getElementById('su-password').value.trim();

    const err = validateSignup(name, email, pwd);
    if (err) { showSuErr(err); return; }
    showSuErr('');

    if (isLocal) {
      const users = getUsers();
      if (users.some(u => u.email === email || u.name === name)) {
        showSuErr('User with this e-mail or nickname already exists');
        return;
      }
      users.push({ name, email, pwd });
      saveUsers(users);
      await finishLogin(name, false);
      closeModal();
      return;
    }

    try {
      const res = await fetch(apiUrl('/signup'), {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ username: name, email, password: pwd })
      });

      if (!res.ok) {
        const data = await res.json().catch(()=>({}));
        showSuErr(data.detail || `Server error (${res.status})`);
        return;
      }

      const data = await res.json();
      await finishLogin(data.name || name, false);
      if (data.token) localStorage.setItem('pp_token', data.token); // Save token after signup
      closeModal();
    } catch (e2) {
      showSuErr(`Network error: ${e2.message}`);
    }
  });


  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('li-identifier').value.trim();
    const pwd   = document.getElementById('li-password').value.trim();
    if (!username || !pwd) return;

    try {
      const res = await fetch(apiUrl('/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: pwd })
      });

      if (!res.ok) {
        const err = await res.json();
        loginError.textContent = err.detail || 'Login failed';
        return;
      }

      const data = await res.json();
      
      // Handle role-based login
      const isAdmin = data.role === 'admin';
      await finishLogin(username, isAdmin);
      
      if (data.token) localStorage.setItem('pp_token', data.token); // Save token after login
      closeModal();
    } catch (err) {
      loginError.textContent = `Error: ${err.message}`;
    }
  });


  const adjustLayoutHeight = () => {
    const bannerHeight = adminBanner.classList.contains('hidden') ? 0 : adminBanner.offsetHeight;
    layoutBox.style.height = `calc(100vh - 64px - ${bannerHeight}px)`;
  };

  const finishLogin = async (name, admin) => {
    isAdmin = admin;
    profileDiv.style.display = 'flex';
    logoutBtn.style.display  = 'inline-block';
    notificationSettingsBtn.classList.remove('hidden');
    notificationSettingsBtn.style.display = 'inline-block';
    userNameSp.textContent   = name;
    loginBtn.style.display   = 'none';
    adminBanner.classList.toggle('hidden', !admin);

    // Save login state to localStorage
    localStorage.setItem('pp_loggedIn', 'true');
    localStorage.setItem('pp_userName', name);
    localStorage.setItem('pp_isAdmin', admin.toString());

    // Show upload button for admin users
    if (admin && !syllabusLoaded) {
      uploadBtn.style.display = 'block';
    } else {
      uploadBtn.style.display = 'none';
    }

    // Show clear button for admin users when syllabus is loaded
    if (clearBtn) clearBtn.style.display = 'none';
    if (admin && syllabusLoaded) {
      if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.id = 'clear-syllabus-btn';
        clearBtn.className = 'upload-btn';
        clearBtn.textContent = 'Clear syllabus';
        clearBtn.style.marginTop = '6px';
        clearBtn.addEventListener('click', clearSyllabus);
        uploadBtn.parentNode.insertBefore(clearBtn, uploadBtn.nextSibling);
      }
      clearBtn.style.display = 'block';
    } else if (clearBtn) {
      clearBtn.style.display = 'none';
    }

    // Hide "no topics" message for admin users
    if (admin && !syllabusLoaded) noTopicsMsg.style.display = 'none';
    
    scoreBtn.classList.remove('hidden');
    notificationSettingsBtn.classList.remove('hidden');
    await loadScore();
    closeModal();
    adjustLayoutHeight();
    
    // Fetch syllabus after login
    fetchSyllabus();
  };

  logoutBtn.addEventListener('click', () => {
    isAdmin = false;
    profileDiv.style.display = 'none';
    logoutBtn.style.display  = 'none';
    notificationSettingsBtn.classList.add('hidden');
    notificationSettingsBtn.style.display = 'none';
    loginBtn.style.display   = 'inline-block';
    adminBanner.classList.add('hidden');
    uploadBtn.style.display  = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    if (!syllabusLoaded) noTopicsMsg.style.display = 'block';
    adjustLayoutHeight();
    scoreBtn.classList.add('hidden');
    notificationSettingsBtn.classList.add('hidden');
    localStorage.removeItem('pp_token'); // Remove token on logout
    // Clear login state from localStorage
    localStorage.removeItem('pp_loggedIn');
    localStorage.removeItem('pp_userName');
    localStorage.removeItem('pp_isAdmin');
  });

  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.setAttribute('accept', '.txt,application/pdf');

  fileInput.addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;

    const name = f.name.toLowerCase();
    if (!name.endsWith('.txt') && !name.endsWith('.pdf')) {
      return alert('Only .txt and .pdf files allowed');
    }

    // Create FormData and send the file directly
    const formData = new FormData();
    formData.append('file', f);

    try {
      const response = await fetch(apiUrl('/save_syllabus'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('pp_token')}`
          // Don't set Content-Type - let browser set it with boundary for FormData
        },
        body: formData
      });
      
      console.log('Save syllabus response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Syllabus saved successfully:', data);
        
        // Update the UI with the topics returned from the backend
        if (data && Array.isArray(data.topics)) {
          updateTopicList(data.topics);
          alert('Syllabus uploaded ✅');
        } else {
          alert('Syllabus uploaded but no topics returned');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Save syllabus failed:', errorData);
        alert(`Failed to save syllabus: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error('Network error saving syllabus:', error);
      alert('Network error saving syllabus');
    }
  });


  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
  });

  userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCodeBtn.click();
    }
  });

  window.chooseDifficulty = async level => {
    // Check if user is logged in before allowing difficulty selection
    const isLoggedIn = localStorage.getItem('pp_loggedIn') === 'true';
    if (!isLoggedIn) {
      showMessage('❗️ Please log in to use the bot', 'bot');
      openModal();
      return;
    }
    
    if (!syllabusLoaded) return;
    hideQuote();
    if (!selectedTopic) {
      return showMessage('❗️ Please select topic first', 'bot');
    }
    
    // Prevent multiple simultaneous task generation requests
    if (generatingTasks.has(currentTopicKey)) {
      console.log('Task generation already in progress for this topic, ignoring click');
      return;
    }
    
    // Map frontend difficulty to backend difficulty
    const difficultyMap = {
      'beginner': 'easy',
      'medium': 'medium', 
      'hard': 'hard'
    };
    const backendDifficulty = difficultyMap[level] || 'easy';
    
    currentDifficulty = level;
    hintBtn.disabled = true;   // закрываем кнопку
    attemptMade      = false;  // нет ещё попыток
    const requestKey = currentTopicKey;

    if (diffPromptMsg) {
      diffPromptMsg.remove();
      diffPromptMsg = null;
    }

    const labels = { beginner: '🟢 Beginner', medium: '🟡 Medium', hard: '🔴 Hard' };
    showMessage(labels[level], 'user');
    const stopNotice = makeWaitingNotice('⏳ Generating your exercise, please wait…');

    // Set loading state for this specific topic
    generatingTasks.add(requestKey);
    currentlyGeneratingTopic = requestKey;
    console.log(`Starting task generation for topic: ${requestKey}`);

    // Disable difficulty buttons only if this is the current active topic
    if (currentTopicKey === requestKey) {
      const difficultyButtons = document.querySelectorAll('#difficulty-buttons button');
      difficultyButtons.forEach(btn => btn.disabled = true);
      console.log('Difficulty buttons disabled for current topic during task generation');
    }

    try {
      const res = await fetch(apiUrl('/generate_task'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          topic: selectedTopic,
          difficulty: backendDifficulty
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || res.statusText);
      }
      
      const taskObj = await res.json();
      console.log("Raw JSON response from backend:", taskObj);
      
      // Handle null response (timeout)
      if (!taskObj) {
        throw new Error('Task generation timed out. Please try again.');
      }

      // Store the entire task object
      lastTasks[requestKey] = taskObj;
      lastDifficulty[requestKey] = level;

      // Обновляем локальные переменные, только если пользователь всё ещё на этой теме
      const isStillHere = currentTopicKey === requestKey;
      if (isStillHere) {
        currentTaskRaw = taskObj;
      }

      // Extract hints
      if (taskObj.Hints && typeof taskObj.Hints === 'object') {
        const hints = [
          taskObj.Hints.Hint1 || '',
          taskObj.Hints.Hint2 || '',
          taskObj.Hints.Hint3 || ''
        ].filter(hint => hint.trim() !== '');
        
        // Store hints per topic
        topicHints[requestKey] = {
          hints: hints,
          count: 0
        };
      } else {
        topicHints[requestKey] = {
          hints: [],
          count: 0
        };
      }

      console.log('Parsed hints for topic:', requestKey, topicHints[requestKey]);

      let out = `📝 *${taskObj["Task_name"]}*\n\n`;
      out += `${taskObj["Task_description"]}\n\n`;
      out += `🧪 Sample cases:\n`;
      taskObj["Sample_input_cases"].forEach(({ input, expected_output }) => {
        out += `• Input: ${input} → Expected: ${expected_output}\n`;
      });

      pushToChat(out, 'bot', requestKey);

      if (!isStillHere) {
        const li = [...document.querySelectorAll('#topics-list li')]
                    .find(el => el.textContent.trim() === selectedTopic);
        li && li.classList.add('has-new');   // CSS .has-new { font-weight:bold; }
      }

      if (isStillHere) {             // не трогаем чужую вкладку
        submitCodeBtn.disabled = false;
        hintBtn.disabled       = true;
      }

      console.log('Parsed hints:', topicHints[requestKey]);
    } catch (err) {
      showMessage(`Error: ${err.message}`, 'bot');
    } finally {
      // Clear loading state for this specific topic
      generatingTasks.delete(requestKey);
      console.log(`Task generation completed for topic: ${requestKey}`);
      
      // Re-enable difficulty buttons after generation
      const difficultyButtons = document.querySelectorAll('#difficulty-buttons button');
      difficultyButtons.forEach(btn => btn.disabled = false);
      console.log('Difficulty buttons re-enabled after generation');
      
      // Reset the flag after re-enabling buttons
      currentlyGeneratingTopic = null;
      
      stopNotice();
    }
    if (currentTopicKey === requestKey) {
    submitCodeBtn.disabled = false;   // ← принудительно включаем
    hintBtn.disabled = true;
 }
  };

  submitCodeBtn.addEventListener('click', async () => {
  console.log('Submit button clicked');
  
  // Check if user is logged in before allowing code submission
  const isLoggedIn = localStorage.getItem('pp_loggedIn') === 'true';
  if (!isLoggedIn) {
    showMessage('❗️ Please log in to use the bot', 'bot');
    openModal();
    return;
  }
  
  if (!selectedTopic) {
    console.log('No selectedTopic, returning');
    return showMessage('❗️ Please select topic first', 'bot');
  }

  console.log('Selected topic:', selectedTopic);
  console.log('Current topic key:', currentTopicKey);
  console.log('Submitting topics:', Array.from(submittingTopics));
  console.log('Disabled topics:', Array.from(disabledTopics));

  /* 1. "Фиксируем" всё, что относится к текущему топику —
        дальше пользователь может уйти куда угодно, а мы работаем
        с этими сохранёнными значениями. */
  const requestKey   = currentTopicKey;          // snake_case ключ темы
  const topicName    = selectedTopic;            //  название
  const taskObj      = lastTasks[requestKey];    // ← нужная задача
  const diffToSend   = lastDifficulty[requestKey];

  // Prevent multiple simultaneous submissions
  if (submittingTopics.has(requestKey)) {
    console.log('Submission already in progress for this topic, ignoring click');
    console.log('Request key:', requestKey);
    console.log('Submitting topics:', Array.from(submittingTopics));
    return;
  }

  console.log('No submission in progress, proceeding with submission');

  if (!taskObj) {
    return showMessage('❗️ First generate a task for this topic', 'bot');
  }

  const code = userInput.value.trim();
  if (!code) return;

  // Set loading state for this specific topic
  submittingTopics.add(requestKey);
  
  // Temporarily disable inputs during submission (simple approach)
  submitCodeBtn.disabled = true;
  userInput.disabled = true;
  console.log(`Starting submission for topic: ${requestKey}, disabled inputs temporarily`);

  /* 2. Печатаем код в нужной ветке чата */
  pushUserCode(code, requestKey);

  attemptMade      = true;   // теперь попытка есть
  hintBtn.disabled = false;  // открываем подсказки

  /* 3. Готовим UI */
  hintBtn.disabled = false;
  userInput.value  = '';
  userInput.style.height = 'auto';
  const stopNotice = makeWaitingNotice('⏳ Checking your solution…');

  // Reset hint count for this topic when making a new submission
  if (topicHints[requestKey]) {
    topicHints[requestKey].count = 0;
    console.log(`Reset hint count for topic: ${requestKey}`);
  }

  /* 4. Отправляем на сервер ровно тот task, что лежит в кэше топика */
  try {
    // Check if user is still authenticated
    const isSessionValid = await validateSession();
    if (!isSessionValid) {
      throw new Error('Session expired. Please log in again.');
    }

    const res = await fetch(apiUrl('/submit_code'), {
      method : 'POST',
      headers: getAuthHeaders(),
      body   : JSON.stringify({
        task       : taskObj["Task_name"],  // ← отправляем только название задачи как строку
        code
      })
    });
    
    // Check if response is JSON or HTML
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Received HTML instead of JSON - likely an error page
      const htmlResponse = await res.text();
      console.error('Received HTML response:', htmlResponse.substring(0, 200));
      throw new Error('Server returned HTML instead of JSON. This usually means the server is down or there\'s an authentication issue. Please try refreshing the page and logging in again.');
    }
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error (${res.status})`);
    }

    const respText = await res.json();
    console.log('Raw response from submit_code:', respText);

    /* 5. Ответ кладём в нужный топик */
    // Handle new JSON response format from backend
    let feedbackMessage;
    if (typeof respText === 'object' && respText.feedback) {
      feedbackMessage = respText.feedback;
      console.log('Extracted feedback from object:', feedbackMessage);
    } else {
      feedbackMessage = respText; // Fallback for string responses
      console.log('Using response as string:', feedbackMessage);
    }
    
    console.log('Final feedback message:', feedbackMessage);
    console.log('Message starts with "✅ Correct solution!"?', feedbackMessage.startsWith('✅ Correct solution!'));
    
    pushToChat(feedbackMessage, 'bot', requestKey);

    // Always refresh score from backend after any submission
    console.log('Refreshing score from backend after submission...');
    await loadScore();
    console.log('Score refreshed from backend. Current score:', solvedCount);

  } catch (err) {
    console.error('Submit code error:', err);
    pushToChat(`Error: ${err.message}`, 'bot', requestKey);
  } finally {
    // Clear loading state for this specific topic
    submittingTopics.delete(requestKey);
    
    // Re-enable inputs
    submitCodeBtn.disabled = false;
    userInput.disabled = false;
    console.log(`Submission completed for topic: ${requestKey}, re-enabled inputs`);
    stopNotice();
  }
});


  hintBtn.addEventListener('click', () => {
    // Check if user is logged in before allowing hints
    const isLoggedIn = localStorage.getItem('pp_loggedIn') === 'true';
    if (!isLoggedIn) {
      showMessage('❗️ Please log in to use the bot', 'bot');
      openModal();
      return;
    }
    if (!attemptMade) return showMessage('❗️ Send code first', 'bot'); // alert new
    if (!syllabusLoaded) return;
    if (!selectedTopic) return showMessage('❗️ Please select topic first', 'bot');
    if (!currentDifficulty) return showMessage('❗️ Please select difficulty first', 'bot');
    if (!topicHints[currentTopicKey] || !topicHints[currentTopicKey].hints.length) return showMessage('❗️ No hints available for this task.', 'bot');
    if (topicHints[currentTopicKey].count >= 3) {
      showMessage("You’ve used all your hints for this submission. Try improving your code or ask for feedback.", 'bot');
      return;
    }
    showMessage('💡 Hint please! 🥺', 'user');
    showMessage(`💡 Hint: ${topicHints[currentTopicKey].hints[topicHints[currentTopicKey].count]}`, 'bot');
    topicHints[currentTopicKey].count++;
  });

  const showHintTip = m => {
    const o = hintWrapper.querySelector('.hint-tooltip');
    if (o) o.remove();
    const t = document.createElement('div');
    t.className = 'hint-tooltip';
    t.textContent = m;
    hintWrapper.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  };

  hintHelp.addEventListener('click', () => {
    if (hintBtn.disabled) showHintTip('❗️ Send code to get a hint');
  });

  // Notification Settings Modal logic
  const notificationSettingsBtn = document.getElementById('notification-settings-btn');
  const notificationSettingsModal = document.getElementById('notification-settings-modal');
  const notificationSettingsClose = document.getElementById('notification-settings-close');
  const notificationSettingsForm = document.getElementById('notification-settings-form');
  const notificationEnabled = document.getElementById('notification-enabled');
  const notificationTime = document.getElementById('notification-time');
  const notificationDays = document.querySelectorAll('.day-checkboxes input[type="checkbox"]');

  // Show modal on bell click
  notificationSettingsBtn.addEventListener('click', () => {
    notificationSettingsModal.classList.remove('hidden');
    loadNotificationSettings();
    force24HourFormat(); // Force 24-hour format
  });
  notificationSettingsClose.addEventListener('click', () => {
    notificationSettingsModal.classList.add('hidden');
  });

  // Load settings from backend
  async function loadNotificationSettings() {
    try {
      const token = localStorage.getItem('pp_token');
      if (!token) {
        console.log('No token found, cannot load notification settings');
        return;
      }
      
      console.log('Loading notification settings from backend...');
      const res = await fetch(apiUrl('/notification-settings'), {
        headers: getAuthHeaders()
      });
      
      console.log('Notification settings response status:', res.status);
      
      if (res.ok) {
        const settings = await res.json();
        console.log('Received notification settings:', settings);
        
        // Apply settings to form - use backend field names
        notificationEnabled.checked = settings.enabled || false;
        notificationTime.value = settings.notification_time || '09:00';
        
        // Set day checkboxes - use backend field name
        const selectedDays = settings.notification_days || [1, 2, 3, 4, 5];
        notificationDays.forEach(cb => {
          cb.checked = selectedDays.includes(parseInt(cb.value));
        });
        
        console.log('Notification settings loaded successfully');
      } else {
        console.error('Failed to load notification settings, status:', res.status);
        const errorData = await res.json().catch(() => ({}));
        console.error('Error details:', errorData);
        
        // Set default values if loading fails
        notificationEnabled.checked = false;
        notificationTime.value = '09:00';
        notificationDays.forEach(cb => {
          cb.checked = [1, 2, 3, 4, 5].includes(parseInt(cb.value));
        });
      }
    } catch (e) {
      console.error('Error loading notification settings:', e);
      
      // Set default values on error
      notificationEnabled.checked = false;
      notificationTime.value = '09:00';
      notificationDays.forEach(cb => {
        cb.checked = [1, 2, 3, 4, 5].includes(parseInt(cb.value));
      });
    }
  }

  // Force 24-hour format for time input
  const force24HourFormat = () => {
    const timeInput = document.getElementById('notification-time');
    if (timeInput) {
      // Add validation for 24-hour format
      timeInput.addEventListener('input', function(e) {
        let value = this.value.replace(/[^0-9:]/g, '');
        
        // Auto-insert colon after 2 digits
        if (value.length === 2 && !value.includes(':')) {
          value += ':';
        }
        
        // Limit to HH:MM format
        if (value.length > 5) {
          value = value.substring(0, 5);
        }
        
        this.value = value;
      });
      
      // Validate on blur
      timeInput.addEventListener('blur', function() {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (this.value && !timeRegex.test(this.value)) {
          alert('Please enter time in 24-hour format (HH:MM, e.g., 09:00, 14:30)');
          this.value = '09:00';
        }
      });
      
      // Set a default value in 24-hour format if empty
      if (!timeInput.value) {
        timeInput.value = '09:00';
      }
      
      console.log('24-hour format validation added for time input');
    }
  };

  // Save settings to backend
  notificationSettingsForm.addEventListener('submit', async e => {
    e.preventDefault();
    console.log('Notification settings form submitted!');
    const token = localStorage.getItem('pp_token');
    if (!token) return;
    const days = Array.from(notificationDays).filter(cb => cb.checked).map(cb => parseInt(cb.value));
    const settings = {
      enabled: notificationEnabled.checked,
      notification_time: notificationTime.value,
      notification_days: days
    };
    try {
      const res = await fetch(apiUrl('/notification-settings'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        notificationSettingsModal.classList.add('hidden');
        showMessage('✅ Notification settings saved!', 'bot');
      } else {
        const err = await res.json();
        showMessage(`❌ ${err.detail || 'Error saving settings'}`, 'bot');
      }
    } catch (e) {
      showMessage('❌ Network error', 'bot');
    }
  });

  // Restore login state on page load
  (async () => {
    await restoreLoginState();
  })();
  
  adjustLayoutHeight();
});

  // Test function to manually test save_syllabus endpoint
  window.testSaveSyllabus = async () => {
    const testTopics = [
      "Introduction to Programming",
      "Variables and Data Types", 
      "Control Structures",
      "Functions",
      "Modules and Packages"
    ];
    
    console.log('Testing save_syllabus with topics:', testTopics);
    
    try {
      const response = await fetch(apiUrl('/save_syllabus'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ topics: testTopics })
      });
      
      console.log('Test save syllabus response status:', response.status);
      
      if (response.ok) {
        console.log('Test syllabus saved successfully');
        alert('Test syllabus saved successfully!');
        updateTopicList(testTopics);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Test save syllabus failed:', errorData);
        alert(`Test failed: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error('Test network error:', error);
      alert('Test network error');
    }
  };

  // Test function to manually check score
  window.testScore = async () => {
    console.log('=== TESTING SCORE SYSTEM ===');
    console.log('Current solvedCount:', solvedCount);
    console.log('scoreCntSp element:', scoreCntSp);
    console.log('scoreText element:', scoreText);
    
    try {
      await loadScore();
      console.log('Score test completed');
    } catch (error) {
      console.error('Score test error:', error);
    }
  };

  // Test function to check input states
  window.testInputs = () => {
    console.log('=== TESTING INPUT STATES ===');
    console.log('currentTopicKey:', currentTopicKey);
    console.log('selectedTopic:', selectedTopic);
    console.log('submitCodeBtn.disabled:', submitCodeBtn.disabled);
    console.log('userInput.disabled:', userInput.disabled);
    console.log('submittingTopics:', Array.from(submittingTopics));
    console.log('disabledTopics:', Array.from(disabledTopics));
    console.log('lastTasks:', lastTasks);
    
    // Force enable inputs for testing
    submitCodeBtn.disabled = false;
    userInput.disabled = false;
    console.log('Forced inputs enabled for testing');
  };