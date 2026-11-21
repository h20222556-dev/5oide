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
  }

  // ─── 화면 전환 ─────────────────────────────────────────────────────────────

  showScreen(screenId) {
    if (this.screenTitle) this.screenTitle.classList.toggle('active', screenId === 'title');
    if (this.screenGame) this.screenGame.classList.toggle('active', screenId === 'game');
  }

  // ─── 배경 렌더링 ───────────────────────────────────────────────────────────

  setBackground(bgId) {
    if (!this.bgLayer) return;

    if (!bgId || bgId === 'bg_black') {
      this.bgLayer.style.backgroundImage = '';
      this.bgLayer.style.backgroundColor = '#000';
      if (this.bgPlaceholder) this.bgPlaceholder.style.display = 'none';
      return;
    }

    const imgPath = `assets/backgrounds/${bgId}.png`;
    const img = new Image();
    img.onload = () => {
      this.bgLayer.style.backgroundImage = `url('${imgPath}')`;
      this.bgLayer.style.backgroundColor = '';
      if (this.bgPlaceholder) this.bgPlaceholder.style.display = 'none';
    };
    img.onerror = () => {
      // 이미지 파일 없을 때 단색 배경 + 이름 라벨 fallback
      this.bgLayer.style.backgroundImage = '';
      this.bgLayer.style.backgroundColor = '#1e2438';
      if (this.bgPlaceholder) {
        this.bgPlaceholder.textContent = `[배경 이미지: ${bgId}.png]`;
        this.bgPlaceholder.style.display = 'block';
      }
    };
    img.src = imgPath;
  }

  setTime(timeStr) {
    if (this.timeLabel) {
      this.timeLabel.textContent = timeStr || '';
    }
  }

  // ─── 캐릭터 렌더링 (홍조 오버레이 지원) ────────────────────────────────────

  setCharacters(characterList, speakingId, gender = 'female') {
    const slots = {
      left: document.getElementById('char-slot-left'),
      center: document.getElementById('char-slot-center'),
      right: document.getElementById('char-slot-right'),
    };

    Object.values(slots).forEach(s => {
      if (s) s.innerHTML = '';
    });

    if (!characterList || characterList.length === 0) return;

    characterList.forEach(c => {
      const slot = slots[c.position || 'center'];
      if (!slot) return;

      const isSpeaking = speakingId && c.id === speakingId;
      const wrap = document.createElement('div');
      wrap.className = `char-wrapper ${isSpeaking ? 'speaking' : 'silent'}`;
      wrap.style.cssText = 'position:relative;width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center;';

      const expr = c.expression || 'normal';
      // 파일 규칙: assets/characters/{id}/{gender}/{expression}.png
      const imgPath = `assets/characters/${c.id}/${gender}/${expr}.png`;
      const img = document.createElement('img');
      img.alt = `${c.id} (${expr})`;
      img.style.cssText = 'max-height:90%;max-width:100%;object-fit:contain;transition:filter 0.2s, transform 0.2s;';

      img.onerror = () => {
        // 일러스트 없을 때 SVG 실루엣 대체
        wrap.innerHTML = this._makeSilhouetteSVG(c.id, expr, c.blush);
      };
      img.src = imgPath;
      wrap.appendChild(img);

      // 홍조 오버레이 처리: assets/characters/{id}/{gender}/blush.png
      if (c.blush) {
        const blushImg = document.createElement('img');
        blushImg.className = 'blush-overlay';
        blushImg.style.cssText = 'position:absolute;top:20%;left:50%;transform:translateX(-50%);width:40%;pointer-events:none;opacity:0.85;animation:blushPulse 1.5s infinite alternate;';
        blushImg.src = `assets/characters/${c.id}/${gender}/blush.png`;
        blushImg.onerror = () => {
          // 홍조 이미지 없을 때 CSS 오버레이
          const cssBlush = document.createElement('div');
          cssBlush.className = 'blush-fallback';
          cssBlush.style.cssText = 'position:absolute;top:22%;left:50%;transform:translateX(-50%);width:70px;height:24px;background:rgba(255,107,129,0.45);border-radius:50%;filter:blur(8px);pointer-events:none;';
          wrap.appendChild(cssBlush);
        };
        wrap.appendChild(blushImg);
      }

      slot.appendChild(wrap);
    });
  }

  _makeSilhouetteSVG(charId, expression, hasBlush) {
    const colorMap = {
      dakgalbi: '#ff6b6b',
      yangnyeom: '#ee5253',
      goguma: '#feca57',
      bokkeumbap: '#ff9f43',
    };
    const fill = colorMap[charId] || '#7f8c8d';

    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:85%;position:relative;">
        <svg viewBox="0 0 100 200" width="130" height="260" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="35" r="25" fill="${fill}" opacity="0.85"/>
          ${hasBlush ? `<ellipse cx="50" cy="42" rx="18" ry="6" fill="#ff4757" opacity="0.6"/>` : ''}
          <path d="M 20 200 L 20 80 Q 20 65 50 65 Q 80 65 80 80 L 80 200 Z" fill="${fill}" opacity="0.85"/>
          <text x="50" y="125" text-anchor="middle" fill="#fff" font-size="13" font-weight="bold">${charId}</text>
          <text x="50" y="145" text-anchor="middle" fill="#f1f2f6" font-size="11">(${expression})</text>
        </svg>
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
    this.speakerName.style.color = color || 'var(--color-primary, #ff9ecd)';
  }


  setDialogueStyle(speakerType = 'normal') {
    if (!this.dialogueText) return;

    this.dialogueText.classList.remove('dialogue-vo', 'dialogue-os', 'dialogue-narration');
    if (speakerType === 'vo') {
      this.dialogueText.classList.add('dialogue-vo');
    } else if (speakerType === 'os') {
      this.dialogueText.classList.add('dialogue-os');
    } else if (speakerType === 'narration') {
      this.dialogueText.classList.add('dialogue-narration');
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

  startPhoneMessageSequence(partnerName, messageList, onClose) {
    if (!this.phoneOverlay || !this.phoneMessagesList) {
      if (typeof onClose === 'function') onClose();
      return;
    }

    if (this.phonePartnerName) this.phonePartnerName.textContent = partnerName;
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

  // ─── 선택지 ────────────────────────────────────────────────────────────────

  showChoices(question, options, onSelect, opts = {}) {
    if (!this.choicesContainer) return;
    this.choicesContainer.innerHTML = '';
    this.choicesContainer.classList.remove('hidden');

    if (question) {
      const qEl = document.createElement('div');
      qEl.className = opts && opts.isNarration ? 'choice-question narration-prompt' : 'choice-question';
      qEl.textContent = question;
      this.choicesContainer.appendChild(qEl);
    }

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = `choice-btn ${opt.disabled ? 'disabled-choice' : ''}`;

      const cleanText = (opt.text || '')
        .replace(/\s*—\s*효과\s*:.*$/, '')
        .replace(/\s*\(효과\s*:.*?\)/, '')
        .trim();

      if (opt.disabled) {
        btn.innerHTML = `${cleanText} <span class="locked-badge">[${opt.lockedReason || '잠김'}]</span>`;
        btn.disabled = true;
      } else {
        btn.textContent = cleanText;
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

    if (!showAffinity) {
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
      item.innerHTML = `
        <span class="affinity-char-name">${name}</span>
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
        <div style="color:#ff7675;font-weight:bold;margin-top:4px;">★ 재회온도(히든): ${state.reunion_temp ?? 0}</div>
        <div>히든 해금 상태: <b>${state.hiddenUnlocked ? '해금됨(A)' : '미해금(B)'}</b></div>
        <div style="font-size:0.8em;color:#888;margin-top:2px;">고민 상태: ${JSON.stringify(state.troubleStates || {})}</div>
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
    if (this.autoBtn) this.autoBtn.classList.toggle('active', !!isAuto);
    if (this.skipBtn) this.skipBtn.classList.toggle('active', !!isSkip);
  }

  // ─── 성별 / 이름 모달 ──────────────────────────────────────────────────────

  showGenderModal(onSelect, onBack) {
    if (!this.genderModal) return;
    this.genderModal.classList.remove('hidden');

    const btnFemale = document.getElementById('btn-gender-female');
    const btnMale = document.getElementById('btn-gender-male');
    const btnBack = document.getElementById('btn-gender-back');

    if (btnFemale) {
      btnFemale.onclick = () => {
        this.genderModal.classList.add('hidden');
        if (typeof onSelect === 'function') onSelect('female');
      };
    }
    if (btnMale) {
      btnMale.onclick = () => {
        this.genderModal.classList.add('hidden');
        if (typeof onSelect === 'function') onSelect('male');
      };
    }
    if (btnBack) {
      btnBack.onclick = (e) => {
        e.stopPropagation();
        this.genderModal.classList.add('hidden');
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

  setAffinityVisible(visible) {
    if (!this.affinityBar) return;
    this.affinityBar.style.display = visible ? 'flex' : 'none';
  }

  showLikeFeedback(charId, charName, delta, prevVal, nextVal, isVisualOnly = false) {
    const wrapper = this.gameWrapper || document.body;
    let stack = wrapper.querySelector('.like-feedback-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'like-feedback-stack';
      wrapper.appendChild(stack);
    }

    let label = '호감도가 상승했다';
    let tone = 'up';
    if (delta >= 3) {
      label = '호감도가 크게 상승했다';
      tone = 'up-big';
    } else if (delta < 0) {
      label = '호감도가 감소했다';
      tone = 'down';
    }

    const fromPct = Math.max(0, Math.min(100, (prevVal / 10) * 100));
    const toPct = Math.max(0, Math.min(100, (nextVal / 10) * 100));

    const card = document.createElement('div');
    card.className = `like-feedback-card ${tone}`;
    card.innerHTML = `
      <div class="like-feedback-header">
        <span class="like-feedback-name">${charName}</span>
        <span class="like-feedback-text">${label}</span>
      </div>
      <div class="like-bar-track">
        <div class="like-bar-fill" style="width: ${fromPct}%"></div>
      </div>
    `;
    stack.appendChild(card);

    // 한 번 움직였다가 사라짐
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fill = card.querySelector('.like-bar-fill');
        if (fill) fill.style.width = `${toPct}%`;
      });
    });

    setTimeout(() => {
      card.classList.add('fade-out');
      setTimeout(() => {
        if (card.parentNode) card.remove();
      }, 450);
    }, 1800);
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
