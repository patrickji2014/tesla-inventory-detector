/**
 * iPhone & Web Notifications Engine
 * Supports:
 * 1. Pure Web Audio synthesizer chime (zero audio file downloads, works offline)
 * 2. iOS Safari Web Notifications (Home Screen PWA banner alerts)
 * 3. Lock-Screen Mobile Push via ntfy.sh (works when Safari is closed/locked)
 * 4. Device Vibration haptic feedback
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NotificationEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let audioCtx = null;

  /**
   * Initializes or resumes the Web Audio context upon user gesture.
   */
  function initAudio() {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * Plays a distinct, pleasant 4-tone ascending alert chime.
   * Frequencies: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
   */
  function playAlertSound() {
    try {
      const ctx = initAudio();
      if (!ctx) return;

      const now = ctx.currentTime;
      const notes = [
        { freq: 523.25, start: 0, duration: 0.12 },
        { freq: 659.25, start: 0.12, duration: 0.12 },
        { freq: 783.99, start: 0.24, duration: 0.15 },
        { freq: 1046.50, start: 0.39, duration: 0.35 }
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        // Envelope: soft attack, exponential decay
        gain.gain.setValueAtTime(0.001, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.3, now + note.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.duration + 0.05);
      });
    } catch (err) {
      console.warn('[Notifications] Could not play audio chime:', err);
    }
  }

  /**
   * Triggers device vibration pattern if supported.
   */
  function triggerVibrate() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([200, 100, 200, 100, 400]);
      } catch (_) {}
    }
  }

  /**
   * Checks whether browser notifications are supported.
   * @returns {boolean}
   */
  function isNotificationSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Gets current notification permission status ('granted', 'denied', 'default').
   * @returns {string}
   */
  function getPermissionStatus() {
    if (!isNotificationSupported()) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Requests permission to display notifications.
   * @returns {Promise<string>}
   */
  async function requestPermission() {
    if (!isNotificationSupported()) {
      return 'unsupported';
    }
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (err) {
      console.warn('[Notifications] Permission request error:', err);
      return 'denied';
    }
  }

  /**
   * Displays an iOS Web Notification / Service Worker Notification.
   * @param {string} title
   * @param {Object} options - { body, icon, data, tag }
   */
  async function showNotification(title, options = {}) {
    if (!isNotificationSupported()) return null;

    if (Notification.permission !== 'granted') {
      return null;
    }

    const defaultOptions = {
      body: options.body || 'New inventory match detected!',
      icon: options.icon || './assets/icon-192.png',
      badge: './assets/icon-192.png',
      tag: options.tag || 'tesla-inventory-alert',
      renotify: true,
      requireInteraction: true,
      data: options.data || {}
    };

    // If Service Worker is available, use showNotification for better iOS standalone compatibility
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          return await reg.showNotification(title, defaultOptions);
        }
      } catch (_) {}
    }

    // Fallback to standard Notification constructor
    try {
      const n = new Notification(title, defaultOptions);
      if (options.data && options.data.url) {
        n.onclick = function () {
          window.focus();
          window.open(options.data.url, '_blank');
        };
      }
      return n;
    } catch (err) {
      console.warn('[Notifications] Fallback notification failed:', err);
      return null;
    }
  }

  /**
   * Sends a mobile push notification via ntfy.sh (free, zero-account, lock-screen push for iOS).
   * @param {string} topic - ntfy.sh topic name
   * @param {string} title - Push title
   * @param {string} message - Message body
   * @param {string} [clickUrl] - Optional URL to open when tapped
   * @returns {Promise<boolean>}
   */
  async function sendNtfyPush(topic, title, message, clickUrl = '') {
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return false;
    }

    const cleanTopic = topic.trim().replace(/^https?:\/\/ntfy\.sh\//, '');
    const endpoint = `https://ntfy.sh/${encodeURIComponent(cleanTopic)}`;

    const headers = {
      'Title': title,
      'Priority': 'high',
      'Tags': 'car,zap,bell'
    };

    if (clickUrl) {
      headers['Click'] = clickUrl;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: message
      });
      return res.ok;
    } catch (err) {
      console.warn('[Notifications] Failed to send ntfy push:', err);
      return false;
    }
  }

  /**
   * Master dispatch: triggers sound, vibration, browser notification, and optional push.
   * @param {Object} alertData
   * @param {string} alertData.title
   * @param {string} alertData.body
   * @param {string} [alertData.url]
   * @param {Object} [settings]
   */
  async function dispatchAlert(alertData, settings = {}) {
    // 1. Audio chime
    if (settings.soundAlert !== false) {
      playAlertSound();
    }

    // 2. Vibration
    triggerVibrate();

    // 3. In-Browser / PWA notification
    if (settings.browserNotifications !== false) {
      await showNotification(alertData.title, {
        body: alertData.body,
        data: { url: alertData.url }
      });
    }

    // 4. Background lock-screen push (ntfy.sh) if configured
    if (settings.ntfyTopic) {
      await sendNtfyPush(
        settings.ntfyTopic,
        alertData.title,
        alertData.body,
        alertData.url
      );
    }
  }

  return {
    initAudio,
    playAlertSound,
    triggerVibrate,
    isNotificationSupported,
    getPermissionStatus,
    requestPermission,
    showNotification,
    sendNtfyPush,
    dispatchAlert
  };
});
