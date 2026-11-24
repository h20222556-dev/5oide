/**
 * renderer.js — DOM 조작, 텍스트 타이핑, 홍조/자막/휴대폰 연출, 선택지 및 모달 렌더러
 */

'use strict';

class Renderer {
  constructor() {
    // ─── DOM 요소 캐시 ────────────────────────────────────────────────────────
    this.screenTitle      = document.getElementById('screen-title');
    this.screenGame       = document.getElementById('screen-game');
    this.gameWrapper      = document.getElementById('game-wrapper');

    this.bgLayer          = document.getElementById('game-background');
    this.bgPlaceholder    = document.getElementById('bg-placeholder-text');
    this.charactersLayer  = document.getElementById('characters-layer');
    this.timeLabel        = document.getElementById('time-label');
    this.affinityBar      = document.getElementById('affinity-bar');

    this.dialogueBox      = document.getElementById('dialogue-box');
    this.speakerName      = document.getElementById('speaker-name');
    this.dialogueText     = document.getElementById('dialogue-text');
    this.dialogueArrow    = document.getElementById('dialogue-arrow');
    this.choicesContainer = document.getElementById('choices-container');

    this.chapterOverlay   = document.getElementById('chapter-title-overlay');
    this.chapterTitleText = document.getElementById('chapter-title-text');
    this.subtitleOverlay  = document.getElementById('subtitle-overlay');
    this.subtitleText     = document.getElementById('subtitle-text');

    this.phoneOverlay     = document.getElementById('phone-message-overlay');
    this.phonePartnerName = document.getElementById('phone-partner-name');
    this.phoneMessagesList= document.getElementById('phone-messages-list');
    this.btnClosePhone    = document.getElementById('btn-close-phone');
    this.chatListOverlay  = document.getElementById('chat-list-overlay');
    this.promoBillboard   = document.getElementById('promo-billboard-overlay');
    this.sceneFadeOverlay = document.getElementById('scene-fade-overlay');
    this.saveToast        = document.getElementById('save-toast');
    this._toastTimer      = null;
    this._toastHideTimer  = null;
    this._billboardActive = false;
    this._preloadedUrls   = new Set();
    this._loadedUrls      = new Set();
    this.transitionMode   = 'cut';
    this.showChoiceImages = false;
    this.showLikeFeedbackEnabled = true;
    this.likeGauge = typeof LikeGauge === 'function'
      ? new LikeGauge(() => this.gameWrapper || document.body)
      : null;

    // 모달들
    this.genderModal      = document.getElementById('modal-gender');
    this.nameModal        = document.getElementById('modal-name');
    this.saveModal        = document.getElementById('modal-save');
    this.settingsModal    = document.getElementById('modal-settings');
    this.galleryModal     = document.getElementById('modal-gallery');
    this.debugPanel       = document.getElementById('debug-panel');
    this.debugStats       = document.getElementById('debug-stats');
    this.debugSceneSelect = document.getElementById('debug-scene-select');

    this.autoBtn          = document.getElementById('btn-auto');
    this.skipBtn          = document.getElementById('btn-skip');

    // 타이핑 타이머
    this._typingTimer    = null;
    this._typingText     = '';
    this._typingIdx      = 0;
    this._typingCallback = null;
    this.assetManifest   = null;
  }

  setAssetManifest(manifest) {
    this.assetManifest = manifest || null;
    if (this.likeGauge) this.likeGauge.setAssetManifest(this.assetManifest);
  }

  setLikeFeedbackEnabled(enabled) {
    this.showLikeFeedbackEnabled = enabled !== false;
    if (this.likeGauge) this.likeGauge.setEnabled(this.showLikeFeedbackEnabled);
  }

  clearLikeFeedback() {
    if (this.likeGauge) this.likeGauge.clear();
  }

  // ─── 화면 전환 ─────────────────────────────────────────────────────────────

  showScreen(screenId) {
    if (this.screenTitle) this.screenTitle.classList.toggle('active', screenId === 'title');
    if (this.screenGame) this.screenGame.classList.toggle('active', screenId === 'game');
  }

  setTitleBackground(gender = 'female') {
    const titleBg = document.getElementById('title-bg');
    if (!titleBg) return;
    const key = gender === 'male' ? 'bg_title_m' : 'bg_title_f';
    const url = this.assetManifest?.backgrounds?.[key] || `assets/backgrounds/${key}.png`;
    titleBg.style.backgroundImage = `url('${url}')`;
  }

  showTitleWithFade() {
    this.showScreen('title');
    if (!this.screenTitle) return;
    this.screenTitle.classList.remove('title-fade-in');
    void this.screenTitle.offsetWidth;
    this.screenTitle.classList.add('title-fade-in');
    setTimeout(() => {
      if (this.screenTitle) this.screenTitle.classList.remove('title-fade-in');
    }, 600);
  }

  preloadImage(url) {
    if (!url || this._preloadedUrls.has(url)) return;
    this._preloadedUrls.add(url);
    const img = new Image();
    img.onload = () => { this._loadedUrls.add(url); };
    img.src = url;
    if (img.complete && img.naturalWidth > 0) this._loadedUrls.add(url);
  }

  preloadBackground(bgId, overlay = null, gender = 'female') {
    if (!bgId || bgId === 'bg_black') return;
    let resolvedId = bgId;
    if (bgId === 'bg_hotel') resolvedId = overlay === 'night' ? 'bg_hotel_night' : 'bg_hotel_morning';
    else if (bgId === 'bg_promo_video') resolvedId = gender === 'male' ? 'bg_day3_billboard_m' : 'bg_day3_billboard_f';
    const p = this.assetManifest?.backgrounds?.[resolvedId];
    if (p) this.preloadImage(p);
  }

  preloadCharacterSprites(gender = 'female') {
    const table = this.assetManifest?.characters?.[gender];
    if (!table) return;
    for (const exprs of Object.values(table)) {
      for (const url of Object.values(exprs || {})) {
        this.preloadImage(url);
      }
    }
  }

  // ─── 배경 렌더링 ───────────────────────────────────────────────────────────

  setBackground(bgId, overlay = null, gender = 'female') {
    if (!this.bgLayer) return;

    // #9 Day 3 전광판 홍보 장면: 제작한 남/여 전광판 배경 이미지를 전체 배경으로 표시 (중복 스탠딩 숨김)
    if (bgId === 'bg_promo_video') {
      this.hidePromoBillboard();
      this._billboardActive = true;
      this._clearAllCharacterSlots();
      const billboardKey = gender === 'male' ? 'bg_day3_billboard_m' : 'bg_day3_billboard_f';
      this._renderBackgroundImage(billboardKey, null);
      return;
    }

    this.hidePromoBillboard();

    // 숙소 내부: 아침/밤 전용 이미지 사용 (밤 이미지에 이중 어두움 오버레이 미적용)
    let resolvedId = bgId;
    let effectiveOverlay = overlay;
    if (bgId === 'bg_hotel') {
      if (overlay === 'night') {
        resolvedId = 'bg_hotel_night';
        effectiveOverlay = null;
      } else {
        resolvedId = 'bg_hotel_morning';
        effectiveOverlay = null;
      }
    }

    this._renderBackgroundImage(resolvedId, effectiveOverlay);
  }

  _renderBackgroundImage(resolvedId, overlay = null) {
    if (!this.bgLayer) return;

    this.bgLayer.classList.remove('overlay-sunset', 'overlay-night', 'overlay-blur');
    if (overlay === 'sunset') this.bgLayer.classList.add('overlay-sunset');
    else if (overlay === 'night') this.bgLayer.classList.add('overlay-night');
    else if (overlay === 'blur') {
      const cfg = this.assetManifest?.brochureEffect || { blurPx: 8, dim: 0.25 };
      this.bgLayer.style.setProperty('--brochure-blur', `${cfg.blurPx ?? 8}px`);
      this.bgLayer.style.setProperty('--brochure-dim', `${cfg.dim ?? 0.25}`);
      this.bgLayer.classList.add('overlay-blur');
    }

    if (!resolvedId || resolvedId === 'bg_black') {
      this.bgLayer.style.backgroundImage = '';
      this.bgLayer.style.backgroundColor = '#000';
      if (this.bgPlaceholder) this.bgPlaceholder.style.display = 'none';
      return;
    }

    const manifestPath = this.assetManifest?.backgrounds?.[resolvedId];
    const label = this.assetManifest?.backgroundLabels?.[resolvedId] || resolvedId;

    const showPlaceholder = () => {
      this.bgLayer.style.backgroundImage = '';
      this.bgLayer.style.backgroundColor = '#1e2438';
      if (this.bgPlaceholder) {
        this.bgPlaceholder.textContent = `[배경 임시 이미지: ${label}]`;
        this.bgPlaceholder.style.display = 'block';
      }
    };

    if (!manifestPath) {
      showPlaceholder();
      return;
    }

    if (this.bgLayer.dataset.bgUrl === manifestPath && this.bgLayer.style.backgroundImage) {
      if (this.bgPlaceholder) this.bgPlaceholder.style.display = 'none';
      return;
    }

    const applyBgNow = () => {
      this.bgLayer.dataset.bgUrl = manifestPath;
      this.bgLayer.style.backgroundImage = `url('${manifestPath}')`;
      this.bgLayer.style.backgroundColor = '';
      if (this.bgPlaceholder) this.bgPlaceholder.style.display = 'none';
    };

    const doSwap = () => {
      // 프리로드 완료된 이미지는 같은 프레임에서 즉시 동기 교체 (깜빡임 없음)
      if (this._loadedUrls.has(manifestPath)) {
        applyBgNow();
        return;
      }
      const img = new Image();
      img.onload = () => {
        this._loadedUrls.add(manifestPath);
        applyBgNow();
      };
      img.onerror = showPlaceholder;
      img.src = manifestPath;
      if (img.complete && img.naturalWidth > 0) {
        this._loadedUrls.add(manifestPath);
        applyBgNow();
      }
    };

    if (this.transitionMode === 'fade' && this.sceneFadeOverlay && this.bgLayer.dataset.bgUrl) {
      const ov = this.sceneFadeOverlay;
      ov.classList.remove('hidden');
      void ov.offsetWidth;
      ov.classList.add('visible');
      setTimeout(() => {
        doSwap();
        ov.classList.remove('visible');
        setTimeout(() => ov.classList.add('hidden'), 190);
      }, 180);
    } else {
      doSwap();
    }
  }

  showPromoBillboard(gender = 'female') {
    if (!this.promoBillboard) return;
    this._billboardActive = true;
    // 전광판이 보이는 동안에는 다른 캐릭터 스프라이트를 표시하지 않음
    this._clearAllCharacterSlots();

    const key = gender === 'male' ? 'bg_promo_video_m' : 'bg_promo_video_f';
    const imgPath = this.assetManifest?.backgrounds?.[key] || null;
    const dakName = typeof getDisplayName === 'function' ? getDisplayName('dakgalbi', gender) : '닭고기';

    const screenContent = imgPath
      ? `<img src="${imgPath}" alt="${dakName} 홍보 영상">`
      : `<div class="billboard-placeholder">
           <div class="billboard-placeholder-name">${dakName} 홍보 영상</div>
           <div class="billboard-placeholder-sub">여성 버전 이미지 준비 중</div>
         </div>`;

    this.promoBillboard.innerHTML = `
      <div class="billboard-structure">
        <div class="billboard-frame">
          <div class="billboard-screen">
            ${screenContent}
            <div class="billboard-subtitle">춘천 → 남이섬 직행 수상버스 약 40분</div>
          </div>
        </div>
        <div class="billboard-poles">
          <div class="billboard-pole"></div>
          <div class="billboard-pole"></div>
        </div>
      </div>
    `;

    const imgEl = this.promoBillboard.querySelector('.billboard-screen img');
    if (imgEl) {
      imgEl.onerror = () => {
        const screen = this.promoBillboard.querySelector('.billboard-screen');
        if (screen) {
          screen.innerHTML = `
            <div class="billboard-placeholder">
              <div class="billboard-placeholder-name">${dakName} 홍보 영상</div>
              <div class="billboard-placeholder-sub">${gender === 'female' ? '여성 버전 이미지 준비 중' : '이미지 준비 중'}</div>
            </div>
            <div class="billboard-subtitle">춘천 → 남이섬 직행 수상버스 약 40분</div>
          `;
        }
      };
    }

    this.promoBillboard.classList.remove('hidden');
  }

  hidePromoBillboard() {
    this._billboardActive = false;
    if (this.promoBillboard) {
      this.promoBillboard.classList.add('hidden');
      this.promoBillboard.innerHTML = '';
    }
  }

  _clearAllCharacterSlots() {
    ['char-slot-left', 'char-slot-center', 'char-slot-right'].forEach(id => {
      const s = document.getElementById(id);
      if (s) {
        s.innerHTML = '';
        delete s.dataset.charKey;
        delete s.dataset.charId;
        delete s.dataset.charExpr;
        s.classList.remove('visible');
      }
    });
  }

  setTime(timeStr) {
    if (!this.timeLabel) return;
    if (this._hudVisible === false) {
      this.timeLabel.style.display = 'none';
      return;
    }
    this.timeLabel.textContent = timeStr || '';
    this.timeLabel.style.display = timeStr ? 'block' : 'none';
  }

  // ─── 캐릭터 렌더링 (밝기 일정 + 표정 전환 깜빡임 방지 + 여성 임시 박스) ──

  setCharacters(characterList, speakingId, gender = 'female', charactersMap = null) {
    // 전광판 홍보 영상이 표시 중이면 별도 캐릭터 스프라이트를 올리지 않음
    if (this._billboardActive) {
      this._clearAllCharacterSlots();
      return;
    }

    const slots = {
      left: document.getElementById('char-slot-left'),
      center: document.getElementById('char-slot-center'),
      right: document.getElementById('char-slot-right'),
    };

    const list = Array.isArray(characterList) ? characterList : [];
    const usedPositions = new Set(list.map(c => c.position || 'center'));

    // 더 이상 사용하지 않는 슬롯만 비움 (유지되는 캐릭터는 깜빡임 없이 보존)
    for (const [pos, s] of Object.entries(slots)) {
      if (s && !usedPositions.has(pos)) {
        s.innerHTML = '';
        delete s.dataset.charKey;
        delete s.dataset.charId;
        delete s.dataset.charExpr;
        s.classList.remove('visible');
      }
    }

    if (list.length === 0) return;

    list.forEach(c => {
      const pos = c.position || 'center';
      const slot = slots[pos];
      if (!slot) return;
      slot.classList.add('visible');

      const rawExpr = c.expression || '기본';
      const displayName = (charactersMap && charactersMap[c.id]?.name)
        || (typeof getDisplayName === 'function' ? getDisplayName(c.id, gender) : c.id);

      const exprMap = this.assetManifest?.expressionMap?.[c.id] || {};
      const mappedKey = c.id === 'bokkeumbap' ? 'default' : (exprMap[rawExpr] || 'default');
      const genderTable = this.assetManifest?.characters?.[gender]?.[c.id] || {};
      const imgPath = genderTable[mappedKey] || genderTable['default'] || null;

      const charKey = `${c.id}|${imgPath || 'placeholder'}|${rawExpr}|${displayName}`;
      // 같은 캐릭터·같은 표정이면 아무것도 다시 그리지 않음
      if (slot.dataset.charKey === charKey) return;

      // 같은 캐릭터의 표정만 바뀌는 경우: 기존 <img>의 src만 즉시 교체하여 깜빡임 방지
      if (slot.dataset.charId === c.id && imgPath) {
        const existingImg = slot.querySelector('.char-wrapper img');
        if (existingImg) {
          existingImg.alt = `${displayName} (${rawExpr})`;
          existingImg.src = imgPath;
          slot.dataset.charKey = charKey;
          slot.dataset.charExpr = rawExpr;
          return;
        }
      }

      slot.innerHTML = '';
      slot.dataset.charKey = charKey;
      slot.dataset.charId = c.id;
      slot.dataset.charExpr = rawExpr;

      const wrap = document.createElement('div');
      wrap.className = 'char-wrapper';
      wrap.style.cssText = 'position:relative;width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center;';

      if (!imgPath) {
        wrap.innerHTML = this._makePlaceholderBox(c.id, displayName, rawExpr);
        slot.appendChild(wrap);
        return;
      }

      const img = document.createElement('img');
      img.alt = `${displayName} (${rawExpr})`;
      img.style.cssText = 'max-height:90%;max-width:100%;object-fit:contain;';

      img.onerror = () => {
        wrap.innerHTML = this._makePlaceholderBox(c.id, displayName, rawExpr);
      };
      img.src = imgPath;
      wrap.appendChild(img);
      slot.appendChild(wrap);
    });
  }

  _makePlaceholderBox(charId, displayName, expression) {
    const colorMap = {
      dakgalbi: '#FFA94D',
      yangnyeom: '#FF6B6B',
      goguma: '#B197FC',
      bokkeumbap: '#FFE066',
    };
    const accent = colorMap[charId] || '#a4b0be';
    return `
      <div class="char-placeholder-box" style="border-color:${accent};">
        <div class="char-placeholder-name" style="color:${accent};">${displayName}</div>
        <div class="char-placeholder-expr">(${expression})</div>
      </div>
    `;
  }

  // ─── 대사창 & 스타일 (V.O., O.S., 나레이션) ───────────────────────────────

  setSpeaker(displayName, color, speakerType = 'normal') {
    if (!this.speakerName) return;

    if (!displayName || speakerType === 'narration' || speakerType === 'subtitle' || displayName.includes('나레이션') || displayName.includes('내레이션')) {
      this.speakerName.textContent = '';
      this.speakerName.style.display = 'none';
      return;
    }

    // (속마음), [화면 밖], (나레이션) 등 괄호 수식어 완전 제거
    let cleanName = displayName
      .replace(/\(속마음\)|\[속마음\]|\(화면\s*밖\)|\[화면\s*밖\]|\(나레이션\)|\(내레이션\)|\(V\.O\.\)|\(O\.S\.\)/g, '')
      .trim();

    if (!cleanName || cleanName.includes('나레이션') || cleanName.includes('내레이션')) {
      this.speakerName.textContent = '';
      this.speakerName.style.display = 'none';
      return;
    }

    this.speakerName.textContent = cleanName;
    this.speakerName.style.display = 'inline-block';
    this.speakerName.style.color = 'var(--plum)';
  }


  setDialogueStyle(speakerType = 'normal', textLarge = false) {
    if (!this.dialogueText) return;

    this.dialogueText.classList.remove('dialogue-vo', 'dialogue-os', 'dialogue-narration', 'dialogue-large');
    if (speakerType === 'vo') {
      this.dialogueText.classList.add('dialogue-vo');
    } else if (speakerType === 'os') {
      this.dialogueText.classList.add('dialogue-os');
    } else if (speakerType === 'narration') {
      this.dialogueText.classList.add('dialogue-narration');
    }
    if (textLarge) {
      this.dialogueText.classList.add('dialogue-large');
    }
  }

  startTyping(text, textSpeed, onComplete) {
    this.completeTyping();

    this._typingText = text || '';
    this._typingIdx = 0;
    this._typingCallback = onComplete;
    if (this.dialogueText) this.dialogueText.textContent = '';

    this.setArrow(false);

    if (textSpeed <= 0) {
      if (this.dialogueText) this.dialogueText.textContent = this._typingText;
      this.setArrow(true);
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    this._typingTimer = setInterval(() => {
      if (this._typingIdx < this._typingText.length) {
        if (this.dialogueText) {
          this.dialogueText.textContent += this._typingText[this._typingIdx];
        }
        this._typingIdx++;
      } else {
        clearInterval(this._typingTimer);
        this._typingTimer = null;
        this.setArrow(true);
        if (typeof this._typingCallback === 'function') {
          const cb = this._typingCallback;
          this._typingCallback = null;
          cb();
        }
      }
    }, textSpeed);
  }

  completeTyping() {
    if (this._typingTimer !== null) {
      clearInterval(this._typingTimer);
      this._typingTimer = null;
      if (this.dialogueText) {
        this.dialogueText.textContent = this._typingText;
      }
      this.setArrow(true);
      if (typeof this._typingCallback === 'function') {
        const cb = this._typingCallback;
        this._typingCallback = null;
        cb();
      }
    }
  }

  setArrow(show) {
    if (this.dialogueArrow) {
      this.dialogueArrow.style.visibility = show ? 'visible' : 'hidden';
    }
  }

  // ─── 자막 표시 ─────────────────────────────────────────────────────────────

  showSubtitle(text, duration = 3000) {
    if (!this.subtitleOverlay || !this.subtitleText) return;
    this.subtitleText.textContent = text;
    this.subtitleOverlay.classList.remove('hidden');

    setTimeout(() => {
      this.subtitleOverlay.classList.add('hidden');
    }, duration);
  }

  // ─── 휴대폰 메시지 말풍선 UI (말풍선 순차 표시) ──────────────────────────

  showPhoneMessages(partnerName, messageList, onClose) {
    this.startPhoneMessageSequence(partnerName, messageList, onClose);
  }

  startPhoneMessageSequence(partnerName, messageList, onClose, partnerColor = null) {
    if (!this.phoneOverlay || !this.phoneMessagesList) {
      if (typeof onClose === 'function') onClose();
      return;
    }

    if (this.phonePartnerName) {
      this.phonePartnerName.textContent = partnerName;
      this.phonePartnerName.style.color = partnerColor || '#ffffff';
    }
    this.phoneMessagesList.innerHTML = '';
    this.phoneOverlay.classList.remove('hidden');

    let currentMsgIdx = 0;
    let isFinished = false;

    const appendNextBubble = () => {
      if (currentMsgIdx < messageList.length) {
        const m = messageList[currentMsgIdx];
        const bubble = document.createElement('div');
        const isMe = m.sender === 'player' || m.sender === '주인공';
        bubble.className = `phone-bubble ${isMe ? 'bubble-me' : 'bubble-other'}`;
        const senderLabel = isMe ? (m.senderName || '나') : (m.senderName || partnerName);
        bubble.innerHTML = `
          <div class="bubble-sender">${senderLabel}</div>
          <div class="bubble-text">${m.text}</div>
        `;
        this.phoneMessagesList.appendChild(bubble);
        this.phoneMessagesList.scrollTop = this.phoneMessagesList.scrollHeight;
        currentMsgIdx++;
      } else {
        // 모든 말풍선 출력 후 다음 입력 시 닫기
        cleanupAndClose();
      }
    };

    const cleanupAndClose = () => {
      if (isFinished) return;
      isFinished = true;
      this.hidePhoneMessages();
      this.phoneOverlay.removeEventListener('click', handleOverlayClick);
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof onClose === 'function') onClose();
    };

    const handleOverlayClick = (e) => {
      if (e.target === this.btnClosePhone || this.btnClosePhone?.contains(e.target)) {
        return;
      }
      e.stopPropagation();
      appendNextBubble();
    };

    const handleKeyDown = (e) => {
      if (['Space', 'Enter'].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        appendNextBubble();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanupAndClose();
      }
    };

    this.phoneOverlay.addEventListener('click', handleOverlayClick);
    window.addEventListener('keydown', handleKeyDown);

    if (this.btnClosePhone) {
      this.btnClosePhone.onclick = (e) => {
        e.stopPropagation();
        cleanupAndClose();
      };
    }

    // 첫 말풍선 1개 바로 표시
    appendNextBubble();
  }

  hidePhoneMessages() {
    if (this.phoneOverlay) this.phoneOverlay.classList.add('hidden');
  }

  // ─── 채팅 목록 UI (코드 제작 — #6 Day 1 밤, #7 Day 2 아침, #8 Day 2 밤) ────

  showChatList(mode, { gender = 'female', day1Visited = [], charactersMap = {}, vars = {} } = {}) {
    if (!this.chatListOverlay) return;
    if (this._lastChatListMode === mode && !this.chatListOverlay.classList.contains('hidden')) return;
    this._lastChatListMode = mode;

    const placeToChar = { lego: 'dakgalbi', skywalk: 'goguma', myeongdong: 'yangnyeom' };
    const colorMap = { dakgalbi: '#FFA94D', yangnyeom: '#FF6B6B', goguma: '#B197FC' };
    const resolveTxt = (t) => (typeof resolveTextVariables === 'function' ? resolveTextVariables(t, vars) : t);

    let rows = [];
    let headerTime = '오후 9:30';

    if (mode === 'day1') {
      const visitedChars = (day1Visited || []).map(p => placeToChar[p]).filter(Boolean);
      const baseOrder = visitedChars.length === 3
        ? visitedChars.slice().reverse()
        : ['dakgalbi', 'goguma', 'yangnyeom'];
      const day1Msgs = {
        dakgalbi: '다음에 또 만나면 그때는 더 재미있는 곳 소개해 드릴게요~!',
        goguma: '언제든 환영이에요. {player}씨를 위해 따뜻한 음료를 준비해 둬야겠어요~',
        yangnyeom: '궁금하시면 연락하세요.',
      };
      const times = ['오후 7:15', '오후 4:40', '오후 1:25'];
      rows = baseOrder.map((cid, idx) => ({
        id: cid,
        msg: resolveTxt(day1Msgs[cid] || ''),
        time: times[idx] || '오후 1:00',
        unread: 0,
      }));
      headerTime = '오후 9:30';
    } else if (mode && mode.startsWith('day2_step')) {
      const stepNum = parseInt(mode.replace('day2_step', ''), 10) || 3;
      const day2All = [
        { id: 'dakgalbi', msg: '내일 친구들이랑 남이섬 가기로 했는데 혹시...', time: '오후 10:02', unread: 1 },
        { id: 'yangnyeom', msg: '내일 남이섬 안 갈래요?', time: '오후 10:02', unread: 1 },
        { id: 'goguma', msg: '내일 남이섬에 가려고 하는데, 함께 가면 좋을 것 같...', time: '오후 10:03', unread: 1 },
      ];
      rows = day2All.slice(0, stepNum);
      headerTime = '오후 10:03';
    }

    const renderRow = (r, idx) => {
      const name = charactersMap?.[r.id]?.name || (typeof getDisplayName === 'function' ? getDisplayName(r.id, gender) : r.id);
      const spritePath = this.assetManifest?.characters?.[gender]?.[r.id]?.default || null;
      const bgCol = colorMap[r.id] || '#7f8c8d';
      const avatarHtml = spritePath
        ? `<div class="chat-avatar"><img src="${spritePath}" alt="${name}"></div>`
        : `<div class="chat-avatar chat-avatar-fallback" style="background:${bgCol};">${name.charAt(0)}</div>`;
      const badgeHtml = r.unread > 0 ? `<span class="chat-unread-badge">${r.unread}</span>` : '';
      return `
        <div class="chat-row ${r.unread > 0 ? 'chat-row-arrive' : ''}" data-char="${r.id}" style="animation-delay:${idx * 60}ms">
          ${avatarHtml}
          <div class="chat-row-body">
            <div class="chat-row-top">
              <span class="chat-row-name">${name}</span>
              <span class="chat-row-time">${r.time}</span>
            </div>
            <div class="chat-row-bottom">
              <span class="chat-row-msg">${r.msg}</span>
              ${badgeHtml}
            </div>
          </div>
        </div>
      `;
    };

    this.chatListOverlay.innerHTML = `
      <div class="chat-phone-frame">
        <div class="chat-phone-status">
          <span>${headerTime}</span>
          <span>5G · 87%</span>
        </div>
        <div class="chat-phone-header">채팅</div>
        <div class="chat-list-body">
          ${rows.map(renderRow).join('')}
        </div>
      </div>
    `;
    this.chatListOverlay.classList.remove('hidden');
  }

  hideChatList() {
    this._lastChatListMode = null;
    if (this.chatListOverlay) {
      this.chatListOverlay.classList.add('hidden');
      this.chatListOverlay.innerHTML = '';
    }
  }

  // ─── 선택지 ────────────────────────────────────────────────────────────────

  showChoices(question, options, onSelect, opts = {}) {
    if (!this.choicesContainer) return;
    this.setArrow(false);
    this.choicesContainer.innerHTML = '';
    this.choicesContainer.classList.remove('hidden', 'choices-left-aligned');

    if (question) {
      const qEl = document.createElement('div');
      if (opts && opts.isEndingTitle) qEl.className = 'choice-question ending-title-heading';
      else if (opts && opts.isNarration) qEl.className = 'choice-question narration-prompt';
      else qEl.className = 'choice-question';
      qEl.textContent = question;
      this.choicesContainer.appendChild(qEl);
    }

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isCompleted = !!opt.completed;
      const isLocked = !!opt.disabled && !isCompleted;
      btn.className = [
        'choice-btn',
        isLocked ? 'disabled-choice locked-choice' : '',
        isCompleted ? 'completed-choice' : '',
      ].filter(Boolean).join(' ');

      const cleanText = (opt.text || '')
        .replace(/\s*—\s*효과\s*:.*$/, '')
        .replace(/\s*\(효과\s*:.*?\)/, '')
        .replace(/\s*\(각 보기에[^)]*\)/g, '')
        .trim();

      if (isCompleted) {
        btn.innerHTML = `
          <span class="choice-completed-badge" aria-hidden="true">✓ 완료</span>
          <span class="choice-completed-text">${cleanText}</span>
        `;
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      } else if (isLocked) {
        btn.innerHTML = `
          <span class="choice-locked-main"><span class="lock-icon" aria-hidden="true">🔒</span> ${cleanText}</span>
          <span class="locked-reason">${opt.lockedReason || '잠김'}</span>
        `;
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      } else {
        const imgUrl = (this.showChoiceImages && opt.imageKey)
          ? this.assetManifest?.backgrounds?.[opt.imageKey]
          : null;
        if (cleanText.includes('—')) {
          const [placeName, placeDesc] = cleanText.split('—').map(s => s.trim());
          btn.classList.add('choice-btn-card');
          btn.innerHTML = `
            ${imgUrl ? `<img class="choice-card-thumb" src="${imgUrl}" alt="${placeName}">` : ''}
            <span class="choice-card-title">${placeName}</span>
            ${placeDesc ? `<span class="choice-card-desc">${placeDesc}</span>` : ''}
          `;
        } else {
          btn.textContent = cleanText;
        }
        btn.addEventListener('click', () => {
          this.hideChoices();
          if (typeof onSelect === 'function') onSelect(idx);
        });
      }

      this.choicesContainer.appendChild(btn);
    });
  }

  hideChoices() {
    if (this.choicesContainer) {
      this.choicesContainer.innerHTML = '';
      this.choicesContainer.classList.add('hidden');
    }
  }

  // ─── 호감도 게이지 & 팝업 ───────────────────────────────────────────────────

  updateAffinityBar(affinity, charactersMap, showAffinity) {
    if (!this.affinityBar) return;

    if (this._hudVisible === false || !showAffinity) {
      this.affinityBar.style.display = 'none';
      return;
    }
    this.affinityBar.style.display = 'flex';

    const targetChars = ['dakgalbi', 'yangnyeom', 'goguma'];
    this.affinityBar.innerHTML = '';

    targetChars.forEach(cid => {
      const cMeta = charactersMap ? charactersMap[cid] : null;
      const name = cMeta ? cMeta.name : (typeof getDisplayName === 'function' ? getDisplayName(cid, this.gender || 'female') : cid);
      const val = affinity?.[cid] ?? 0;
      const pct = Math.max(0, Math.min(100, Math.round((val / 12) * 100)));

      const item = document.createElement('div');
      item.className = 'affinity-item';
      item.dataset.char = cid;
      const nameColor = cMeta?.color || '#f0f0f0';
      item.innerHTML = `
        <span class="affinity-char-name" style="color: ${nameColor};">${name}</span>
        <div class="affinity-gauge">
          <div class="affinity-fill" style="width: ${pct}%"></div>
        </div>
        <span class="affinity-heart">♥</span>
        <span class="affinity-val">${val}</span>
      `;
      this.affinityBar.appendChild(item);
    });
  }

  showAffinityPopup(characterId, delta, charName) {
    if (characterId === 'bokkeumbap' || !delta) return;

    const name = charName || characterId;
    const isPositive = delta > 0;
    const text = `${name} 호감도 ${isPositive ? '+' : '-'}${Math.abs(delta)}`;

    const popup = document.createElement('div');
    popup.className = `affinity-popup ${isPositive ? 'positive' : 'negative'}`;
    popup.textContent = text;
    popup.style.cssText = `
      position: absolute;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 10px 22px;
      border-radius: 20px;
      font-size: 1.15rem;
      font-weight: bold;
      pointer-events: none;
      z-index: 500;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      animation: popupFloat 1.2s ease-out forwards;
      background: ${isPositive ? 'rgba(255, 107, 107, 0.95)' : 'rgba(74, 105, 189, 0.95)'};
      color: #fff;
    `;

    const wrapper = this.gameWrapper || document.body;
    wrapper.appendChild(popup);

    setTimeout(() => {
      if (popup.parentNode) popup.remove();
    }, 1200);
  }

  // ─── 디버그 패널 ───────────────────────────────────────────────────────────

  updateDebugPanel(state, sceneList) {
    if (!this.debugPanel) return;

    if (!state.debugMode) {
      this.debugPanel.classList.remove('visible');
      return;
    }
    this.debugPanel.classList.add('visible');

    if (this.debugStats) {
      this.debugStats.innerHTML = `
        <div style="margin-top:4px;">플레이어: <b>${state.playerName || '-'}</b> (${state.gender === 'male' ? '남성판' : '여성판'})</div>
        <div>장면 ID: <b style="color:#00d2d3;">${state.sceneId || '-'}</b> (대사 ${state.dialogueIndex})</div>
        <div style="margin-top:4px;border-top:1px dashed #555;padding-top:4px;">호감도:</div>
        <div>- 닭갈비: <b>${state.affinity?.dakgalbi ?? 0}</b></div>
        <div>- 양념: <b>${state.affinity?.yangnyeom ?? 0}</b></div>
        <div>- 고구마: <b>${state.affinity?.goguma ?? 0}</b></div>
        <div style="color:#ff7675;font-weight:bold;margin-top:4px;">좌석 선택(bus_choice): ${state.busChoice || '-'}</div>
        <div>히든 루트(세 명 모두 &lt; 8): <b>${state.hiddenRoute ? '활성(볶음밥 등장)' : '비활성'}</b></div>
      `;
    }

    // 장면 점프 옵션 채우기 (처음 한 번만)
    if (this.debugSceneSelect && sceneList && this.debugSceneSelect.children.length === 0) {
      sceneList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.id}: ${s.title}`;
        this.debugSceneSelect.appendChild(opt);
      });
    }
    if (this.debugSceneSelect && state.sceneId) {
      this.debugSceneSelect.value = state.sceneId;
    }
  }

  // ─── 메뉴바 상태 ───────────────────────────────────────────────────────────

  updateMenuBar(isAuto, isSkip) {
    if (this.autoBtn) {
      this.autoBtn.classList.toggle('active', !!isAuto);
      this.autoBtn.setAttribute('aria-pressed', isAuto ? 'true' : 'false');
    }
    if (this.skipBtn) {
      this.skipBtn.classList.toggle('active', !!isSkip);
      this.skipBtn.setAttribute('aria-pressed', isSkip ? 'true' : 'false');
    }
  }

  // ─── 성별 / 이름 모달 ──────────────────────────────────────────────────────

  showGenderModal(onSelect, onBack, opts = {}) {
    if (!this.genderModal) return;
    const isInitial = !!opts.initial;
    this.genderModal.classList.remove('is-fading-out');
    this.genderModal.classList.toggle('initial-black-bg', isInitial);
    this.genderModal.classList.remove('hidden');

    const btnFemale = document.getElementById('btn-gender-female');
    const btnMale = document.getElementById('btn-gender-male');
    const btnBack = document.getElementById('btn-gender-back');

    if (btnBack) {
      btnBack.classList.toggle('hidden', isInitial);
    }

    let handled = false;
    const finishSelect = (gender) => {
      if (handled) return;
      handled = true;
      const reducedMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (isInitial && !reducedMotion) {
        this.genderModal.classList.add('is-fading-out');
        setTimeout(() => {
          this.genderModal.classList.add('hidden');
          this.genderModal.classList.remove('initial-black-bg', 'is-fading-out');
          if (typeof onSelect === 'function') onSelect(gender);
        }, 450);
      } else {
        this.genderModal.classList.add('hidden');
        this.genderModal.classList.remove('initial-black-bg', 'is-fading-out');
        if (typeof onSelect === 'function') onSelect(gender);
      }
    };

    if (btnFemale) btnFemale.onclick = () => finishSelect('female');
    if (btnMale) btnMale.onclick = () => finishSelect('male');
    if (btnBack) {
      btnBack.onclick = (e) => {
        e.stopPropagation();
        if (isInitial) return;
        this.genderModal.classList.add('hidden');
        this.genderModal.classList.remove('initial-black-bg', 'is-fading-out');
        if (typeof onBack === 'function') onBack();
      };
    }
  }

  showNameModal(onConfirm, onBack, initialName = '') {
    if (!this.nameModal) return;
    const input = document.getElementById('input-player-name');
    const errorMsg = document.getElementById('name-error-msg');
    const confirmBtn = document.getElementById('btn-name-confirm');
    const backBtn = document.getElementById('btn-name-back');

    if (input) input.value = initialName || '';
    if (errorMsg) errorMsg.classList.add('hidden');
    this.nameModal.classList.remove('hidden');

    const handleConfirm = () => {
      const val = (input ? input.value : '').trim();
      if (!val || val.length > 8) {
        if (errorMsg) errorMsg.classList.remove('hidden');
        return;
      }
      this.nameModal.classList.add('hidden');
      if (typeof onConfirm === 'function') onConfirm(val);
    };

    if (confirmBtn) confirmBtn.onclick = handleConfirm;
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.stopPropagation();
        this.nameModal.classList.add('hidden');
        if (typeof onBack === 'function') onBack(input ? input.value : '');
      };
    }
    if (input) {
      input.onkeydown = (e) => {
        if (e.key === 'Enter') handleConfirm();
      };
      input.focus();
    }
  }

  // ─── 세이브 / 로드 모달 ────────────────────────────────────────────────────

  showSaveModal(mode, slots, onSave, onLoad) {
    if (!this.saveModal) return;
    const titleEl = document.getElementById('modal-save-title');
    if (titleEl) titleEl.textContent = mode === 'save' ? '게임 저장하기' : '게임 불러오기';

    const slotsContainer = document.getElementById('save-slots');
    if (slotsContainer) {
      slotsContainer.innerHTML = '';
      slots.forEach((s, idx) => {
        const slotEl = document.createElement('div');
        slotEl.className = 'save-slot';

        const isEmpty = !s;
        slotEl.innerHTML = `
          <div class="slot-thumbnail">
            <span class="slot-empty-text">${isEmpty ? '빈 슬롯' : s.sceneId}</span>
          </div>
          <div class="slot-info">
            <span class="slot-player">${isEmpty ? '-' : `${s.playerName} (${s.gender === 'male' ? '남' : '여'})`}</span>
            <span class="slot-date">${isEmpty ? '-' : s.date}</span>
          </div>
          <button class="slot-action-btn" data-slot="${idx}">
            ${mode === 'save' ? `슬롯 ${idx + 1} 저장` : `슬롯 ${idx + 1} 불러오기`}
          </button>
        `;

        const btn = slotEl.querySelector('.slot-action-btn');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (mode === 'save') {
            if (typeof onSave === 'function') onSave(idx + 1);
            this.hideSaveModal();
          } else {
            if (!isEmpty && typeof onLoad === 'function') {
              onLoad(idx + 1);
              this.hideSaveModal();
            }
          }
        });

        slotsContainer.appendChild(slotEl);
      });
    }

    this.saveModal.classList.remove('hidden');
  }

  hideSaveModal() {
    if (this.saveModal) this.saveModal.classList.add('hidden');
  }

  // ─── 저장 완료/실패 토스트 팝업 (1.5초 표시 후 페이드, 연속 호출 시 교체) ──

  showToast(message) {
    if (!this.saveToast) return;
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
    if (this._toastHideTimer) { clearTimeout(this._toastHideTimer); this._toastHideTimer = null; }

    this.saveToast.textContent = message;
    this.saveToast.classList.remove('hidden', 'visible');
    void this.saveToast.offsetWidth;
    this.saveToast.classList.add('visible');

    this._toastTimer = setTimeout(() => {
      this._toastTimer = null;
      this.saveToast.classList.remove('visible');
      this._toastHideTimer = setTimeout(() => {
        this._toastHideTimer = null;
        this.saveToast.classList.add('hidden');
      }, 260);
    }, 1500);
  }

  // ─── 설정 모달 ─────────────────────────────────────────────────────────────

  showSettingsModal(settings, onSave) {
    if (!this.settingsModal) return;

    const sliderSpeed = document.getElementById('slider-text-speed');
    const labelSpeed = document.getElementById('label-text-speed');
    const sliderBgm = document.getElementById('slider-bgm');
    const labelBgm = document.getElementById('label-bgm');
    const sliderSfx = document.getElementById('slider-sfx');
    const labelSfx = document.getElementById('label-sfx');
    const toggleAffinity = document.getElementById('toggle-affinity');

    if (sliderSpeed) {
      sliderSpeed.value = settings.textSpeed ?? 40;
      if (labelSpeed) labelSpeed.textContent = `${sliderSpeed.value}ms`;
      sliderSpeed.oninput = () => { if (labelSpeed) labelSpeed.textContent = `${sliderSpeed.value}ms`; };
    }
    if (sliderBgm) {
      sliderBgm.value = settings.bgmVolume ?? 0.5;
      if (labelBgm) labelBgm.textContent = `${Math.round(sliderBgm.value * 100)}%`;
      sliderBgm.oninput = () => { if (labelBgm) labelBgm.textContent = `${Math.round(sliderBgm.value * 100)}%`; };
    }
    if (sliderSfx) {
      sliderSfx.value = settings.sfxVolume ?? 0.7;
      if (labelSfx) labelSfx.textContent = `${Math.round(sliderSfx.value * 100)}%`;
      sliderSfx.oninput = () => { if (labelSfx) labelSfx.textContent = `${Math.round(sliderSfx.value * 100)}%`; };
    }
    if (toggleAffinity) {
      toggleAffinity.checked = settings.showAffinity !== false;
    }

    const saveBtn = document.getElementById('btn-settings-save');
    const cancelBtn = document.getElementById('btn-settings-cancel');

    if (saveBtn) {
      saveBtn.onclick = () => {
        const newSettings = {
          textSpeed: Number(sliderSpeed ? sliderSpeed.value : 40),
          bgmVolume: Number(sliderBgm ? sliderBgm.value : 0.5),
          sfxVolume: Number(sliderSfx ? sliderSfx.value : 0.7),
          showAffinity: toggleAffinity ? toggleAffinity.checked : true,
        };
        if (typeof onSave === 'function') onSave(newSettings);
        this.hideSettingsModal();
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = () => this.hideSettingsModal();
    }

    this.settingsModal.classList.remove('hidden');
  }

  hideSettingsModal() {
    if (this.settingsModal) this.settingsModal.classList.add('hidden');
  }

  // ─── 기록실 모달 ───────────────────────────────────────────────────────────

  showGalleryModal(allEndings, achievedEndings) {
    if (!this.galleryModal) return;

    const grid = document.getElementById('gallery-grid');
    if (grid) {
      grid.innerHTML = '';
      allEndings.forEach(ed => {
        const achieved = achievedEndings.has(ed.id);
        const card = document.createElement('div');
        card.className = `gallery-card ${achieved ? 'achieved' : 'locked'}`;

        if (achieved) {
          const displayTitle = ed.title;
          card.innerHTML = `
            <div class="gallery-card-badge">${ed.badge || '엔딩'}</div>
            <h3 class="gallery-card-title">${displayTitle}</h3>
            <p class="gallery-card-desc">${ed.description}</p>
          `;
        } else {
          card.innerHTML = `
            <div class="gallery-card-badge">미달성</div>
            <h3 class="gallery-card-title">???</h3>
            <p class="gallery-card-desc">${ed.id === 'ending_bokkeumbap' ? '특별한 조건으로 맞이하는 히든 엔딩' : '아직 도달하지 못한 엔딩입니다.'}</p>
          `;
        }
        grid.appendChild(card);
      });
    }

    this.galleryModal.classList.remove('hidden');
  }

  hideGalleryModal() {
    if (this.galleryModal) this.galleryModal.classList.add('hidden');
  }

  // ─── DAY 전환 타이틀 연출 ──────────────────────────────────────────────────

  playDayTransition(dayNum, subtitle, onComplete, onSwitch) {
    const cfg = Object.assign({ fadeOutMs: 1500, holdMs: 3500, fadeInMs: 1500 }, this.dayTransitionConfig || {});
    if (!this.chapterOverlay) {
      if (typeof onSwitch === 'function') onSwitch();
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    this.clearDayTransition();
    const overlay = this.chapterOverlay;

    overlay.innerHTML = `
      <div class="day-title-badge" style="opacity:0;transition:opacity 600ms ease">DAY ${dayNum}</div>
      <div class="day-title-subtitle" style="opacity:0;transition:opacity 600ms ease">${subtitle}</div>
    `;
    // 연출 중에는 클릭/터치를 오버레이가 흡수하고 건너뛰기 없음
    overlay.onclick = (e) => { e.stopPropagation(); e.preventDefault(); };
    overlay.style.transition = `opacity ${cfg.fadeOutMs}ms ease`;
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('visible');

    this._dayTimers = [];
    let completed = false;
    const later = (fn, ms) => { this._dayTimers.push(setTimeout(fn, ms)); };

    const finish = () => {
      if (completed) return;
      completed = true;
      this.clearDayTransition();
      if (typeof onComplete === 'function') onComplete();
    };

    // 1) 페이드 아웃 완료 -> 타이틀 표시
    later(() => {
      overlay.querySelectorAll('.day-title-badge, .day-title-subtitle').forEach(el => { el.style.opacity = '1'; });
    }, cfg.fadeOutMs);

    // 2) 유지 시간 종료 -> 새 하루의 첫 장면을 검은 화면 뒤에서 준비 후 페이드 인
    later(() => {
      if (typeof onSwitch === 'function') onSwitch();
      overlay.style.transition = `opacity ${cfg.fadeInMs}ms ease`;
      overlay.classList.remove('visible');
    }, cfg.fadeOutMs + cfg.holdMs);

    // 3) 페이드 인 완료
    later(finish, cfg.fadeOutMs + cfg.holdMs + cfg.fadeInMs);

    // 안전장치: 어떤 경우에도 입력 잠금이 풀리도록 강제 종료
    later(finish, cfg.fadeOutMs + cfg.holdMs + cfg.fadeInMs + 1500);
  }

  clearDayTransition() {
    if (this._dayTimers) {
      this._dayTimers.forEach(t => clearTimeout(t));
      this._dayTimers = [];
    }
    if (this.chapterOverlay) {
      this.chapterOverlay.onclick = null;
      this.chapterOverlay.style.transition = '';
      this.chapterOverlay.classList.remove('visible');
      this.chapterOverlay.classList.add('hidden');
    }
  }

  // ─── Day 3 전용: 호감도 HUD 표시 제어 / 막대 바 피드백(숫자 미표시) / 엔딩 CG 플레이스홀더 ───

  setHudVisible(visible) {
    this._hudVisible = !!visible;
    if (this.timeLabel) {
      this.timeLabel.style.display = this._hudVisible && this.timeLabel.textContent ? 'block' : 'none';
    }
    if (this.affinityBar) {
      this.affinityBar.style.display = this._hudVisible ? 'flex' : 'none';
    }
  }

  setAffinityVisible(visible) {
    if (!this.affinityBar) return;
    if (this._hudVisible === false) {
      this.affinityBar.style.display = 'none';
      return;
    }
    this.affinityBar.style.display = visible ? 'flex' : 'none';
  }

  showLikeFeedback(charId, charName, delta, prevVal, nextVal, compact = false, labelMode = null, gender = null) {
    if (!this.showLikeFeedbackEnabled) return;
    if (!delta || delta === 0) return;

    if (this.likeGauge) {
      if (this.assetManifest) this.likeGauge.setAssetManifest(this.assetManifest);
      this.likeGauge.show({
        charId,
        charName,
        delta,
        prevVal,
        nextVal,
        compact,
        labelMode,
        gender: gender || this.gender || 'female',
      });
    }
  }

  showCG(cgObj) {
    const wrapper = this.gameWrapper || document.body;
    const old = wrapper.querySelector('.cg-display-layer');
    if (old) old.remove();
    if (!cgObj) return;

    const layer = document.createElement('div');
    layer.className = 'cg-display-layer';

    const img = new Image();
    const imgPath = `assets/cg/${cgObj.id}.png`;
    img.onload = () => {
      layer.innerHTML = `<img class="cg-image" src="${imgPath}" alt="${cgObj.caption || '엔딩 CG'}">`;
    };
    img.onerror = () => {
      layer.innerHTML = `
        <div class="cg-placeholder-box">
          <div class="cg-placeholder-tag">엔딩 CG (${cgObj.id}.png)</div>
          <div class="cg-placeholder-caption">${cgObj.caption || ''}</div>
        </div>
      `;
    };
    img.src = imgPath;

    const dialogueBox = this.dialogueBox;
    if (dialogueBox && dialogueBox.parentNode === wrapper) {
      wrapper.insertBefore(layer, dialogueBox);
    } else {
      wrapper.appendChild(layer);
    }
  }
}
