import { useEffect, useId } from 'react';

function ConfirmDialog({
  show,
  title,
  message,
  detail,
  icon = 'bi-exclamation-triangle',
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmVariant = 'danger',
  hideCancel = false,
  busy = false,
  requiredText,
  inputLabel,
  inputValue = '',
  inputPlaceholder,
  onInputChange,
  onCancel,
  onConfirm,
}) {
  const titleId = useId();
  const inputId = useId();
  const canConfirm = !busy && (!requiredText || inputValue === requiredText);

  useEffect(() => {
    if (!show) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        onCancel?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel, show]);

  if (!show) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ zIndex: 1060 }}>
        <div className="modal-dialog app-confirm-dialog">
          <div className="modal-content app-confirm-content">
            <div className="modal-header app-confirm-header">
              <div className="d-flex align-items-center gap-2 min-w-0">
                <span className={`app-confirm-icon text-${confirmVariant}`}>
                  <i className={`bi ${icon}`}></i>
                </span>
                <h5 id={titleId} className="modal-title text-light mb-0 text-truncate">{title}</h5>
              </div>
              <button type="button" className="btn-close btn-close-white" aria-label="닫기" onClick={onCancel} disabled={busy} />
            </div>
            <div className="modal-body app-confirm-body text-light">
              {message && <p className="app-confirm-message">{message}</p>}
              {detail && <p className="text-secondary small mb-0">{detail}</p>}
              {requiredText && (
                <div className="mt-3">
                  <label className="form-label text-secondary small" htmlFor={inputId}>
                    {inputLabel || `"${requiredText}"를 입력하세요.`}
                  </label>
                  <input
                    id={inputId}
                    className="form-control form-control-sm"
                    value={inputValue}
                    placeholder={inputPlaceholder || requiredText}
                    autoFocus
                    autoComplete="off"
                    onChange={(event) => onInputChange?.(event.target.value)}
                    disabled={busy}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer app-confirm-footer">
              {!hideCancel && (
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel} disabled={busy}>
                  {cancelLabel}
                </button>
              )}
              <button type="button" className={`btn btn-${confirmVariant} btn-sm`} onClick={onConfirm} disabled={!canConfirm}>
                {busy ? '처리 중...' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" style={{ zIndex: 1055 }}></div>
    </>
  );
}

export default ConfirmDialog;
