// About dialog — product identity, and the entry point for factory engineer
// development mode. See docs/factory-dev-mode.md.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import edtLogo from '../../assets/edt-logo.png';
import './AboutDialog.css';

const PRODUCT_NAME = 'EDT GUI Studio';
const COMPANY_NAME = 'Emerging Display Technologies';
const COMPANY_URL = 'https://www.edtc.com';
const DEVELOPER_NAME = 'Rojar Smith';
const DEVELOPER_NAME_ZH = '吳斌';
const DEVELOPER_EMAIL = 'rojar@edt.com.tw';

/** Clicks on the developer's name that reveal the unlock field. */
const UNLOCK_CLICK_COUNT = 5;
/** Clicks must land within this window of each other, in ms. */
const UNLOCK_CLICK_WINDOW_MS = 2000;

interface AboutDialogProps {
  onClose: () => void;
}

const AboutDialog: React.FC<AboutDialogProps> = ({ onClose }) => {
  const factoryDevMode = useAppStore(s => s.factoryDevMode);
  const unlockFactoryDevMode = useAppStore(s => s.unlockFactoryDevMode);

  const [promptVisible, setPromptVisible] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [rejected, setRejected] = useState(false);

  const clickCount = useRef(0);
  const lastClickAt = useRef(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleNameClick = useCallback(() => {
    const now = Date.now();
    // Restart the run when the clicks are too far apart to be deliberate.
    clickCount.current =
      now - lastClickAt.current > UNLOCK_CLICK_WINDOW_MS ? 1 : clickCount.current + 1;
    lastClickAt.current = now;

    if (clickCount.current >= UNLOCK_CLICK_COUNT) {
      clickCount.current = 0;
      setPromptVisible(true);
    }
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (unlockFactoryDevMode(passphrase)) {
      setPromptVisible(false);
      setPassphrase('');
      setRejected(false);
    } else {
      setRejected(true);
      setPassphrase('');
    }
  }, [passphrase, unlockFactoryDevMode]);

  return (
    <div className="modal-global-overlay" onClick={onClose}>
      <div className="modal-dialog about-dialog" onClick={e => e.stopPropagation()}>
        <div className="about-body">
          <a
            className="about-logo-link"
            href={COMPANY_URL}
            target="_blank"
            rel="noreferrer noopener"
            title={COMPANY_URL}
          >
            <img className="about-logo" src={edtLogo} alt={COMPANY_NAME} />
          </a>

          <h2 className="about-product">{PRODUCT_NAME}</h2>
          <div className="about-version">Version {__APP_VERSION__}</div>

          {factoryDevMode && (
            <div className="about-mode-badge">原廠人員研發模式</div>
          )}

          <dl className="about-meta">
            <dt>Developer</dt>
            <dd>
              <span
                className="about-developer-name"
                onClick={handleNameClick}
                title={`${DEVELOPER_NAME} (${DEVELOPER_NAME_ZH})`}
              >
                {DEVELOPER_NAME}（{DEVELOPER_NAME_ZH}）
              </span>
            </dd>

            <dt>Contact</dt>
            <dd>
              <a
                className="about-email"
                href={`mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(
                  `${PRODUCT_NAME} ${__APP_VERSION__} feedback`,
                )}`}
              >
                {DEVELOPER_EMAIL}
              </a>
            </dd>
          </dl>

          {promptVisible && (
            <form className="about-unlock" onSubmit={handleSubmit}>
              <label className="about-unlock-label" htmlFor="about-unlock-input">
                Access code
              </label>
              <div className="about-unlock-row">
                <input
                  id="about-unlock-input"
                  className={`about-unlock-input ${rejected ? 'rejected' : ''}`}
                  type="password"
                  value={passphrase}
                  onChange={e => {
                    setPassphrase(e.target.value);
                    setRejected(false);
                  }}
                  autoFocus
                  autoComplete="off"
                />
                <button type="submit" className="about-unlock-btn">Unlock</button>
              </div>
              {rejected && <div className="about-unlock-error">Incorrect access code.</div>}
            </form>
          )}

          <div className="about-copyright">
            © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
          </div>
        </div>

        <div className="modal-dialog-footer">
          <button className="modal-dialog-btn modal-btn-confirm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutDialog;
