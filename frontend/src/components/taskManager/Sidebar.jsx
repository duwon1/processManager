import React, { useState } from 'react';
import { MiniGraph } from './graphs.jsx';
import { getSidebarValue, RESOURCE_TYPE_ICONS } from './resources.js';

// ── 왼쪽 패널 항목 (5단계 반응형) ───────────────────────────────────────
export function SidebarItem({ resource, isActive, metrics, history, onClick, variant }) {
    const ac  = resource.color;                          // active color
    const ic  = 'var(--pm-text-muted)';                  // inactive color
    const col = isActive ? ac : ic;
    const bl  = `3px solid ${isActive ? ac : 'transparent'}`;

    // 리소스 라벨 조각을 함수로 렌더링해 렌더 중 새 컴포넌트 생성 경고를 피합니다.
    const renderLabel = ({ size = '0.88rem', subSize = '0.72rem', gap = 4 } = {}) => (
        <span title={resource.sublabel ? `${resource.label} ${resource.sublabel}` : resource.label}
              style={{ display: 'flex', alignItems: 'baseline', minWidth: 0, gap }}>
            <span style={{ color: col, fontSize: size, fontWeight: 600, flexShrink: 0 }}>{resource.label}</span>
            {resource.sublabel && (
                <span style={{ color: 'var(--pm-text-muted)', fontSize: subSize, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {resource.sublabel}
                </span>
            )}
        </span>
    );

    const variantStyle = {
        xl: { minWidth: 155, maxWidth: 155, padding: '10px 12px 8px', labelSize: '0.88rem', subSize: '0.72rem', gap: 4 },
        lg: { minWidth: 128, maxWidth: 128, padding: '8px 10px 6px', labelSize: '0.82rem', subSize: '0.68rem', gap: 3 },
    }[variant];

    return (
        <button onClick={onClick}
                className="border-0 text-start flex-shrink-0"
                style={{ background: isActive ? 'var(--pm-surface-soft)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}>

            {variantStyle ? (
                <div
                    style={{
                        minWidth: variantStyle.minWidth,
                        maxWidth: variantStyle.maxWidth,
                        borderLeft: bl,
                        padding: variantStyle.padding,
                    }}
                >
                    <div className="mb-1">
                        {renderLabel({ size: variantStyle.labelSize, subSize: variantStyle.subSize, gap: variantStyle.gap })}
                    </div>
                    <MiniGraph history={history} resource={resource} />
                </div>
            ) : (
                <div
                    className="d-flex flex-column justify-content-center"
                    style={{ minWidth: 88, maxWidth: 88, borderLeft: bl, padding: '8px 8px', minHeight: 50 }}
                >
                    <span style={{ color: col, fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.3 }}>
                        {resource.label}
                        {resource.sublabel && (
                            <span style={{ color: 'var(--pm-text-muted)', fontSize: '0.64rem', marginLeft: 3 }}>
                                {resource.sublabel}
                            </span>
                        )}
                    </span>
                    <span style={{ color: isActive ? ac : 'var(--pm-text-muted)', fontSize: '0.7rem' }}>
                        {getSidebarValue(resource, metrics, history)}
                    </span>
                </div>
            )}
        </button>
    );
}

export function CompactResourcePicker({ resources, selectedKey, metrics, history, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedResource = resources.find(resource => resource.key === selectedKey) ?? resources[0];
    const selectedValue = selectedResource ? getSidebarValue(selectedResource, metrics, history) : 'N/A';

    const handleSelect = (resource) => {
        onSelect(resource.key);
        setIsOpen(false);
    };

    if (!selectedResource) return null;

    return (
        <div className="task-resource-picker">
            <button
                type="button"
                className={`task-resource-picker-toggle ${isOpen ? 'task-resource-picker-toggle-open' : ''}`}
                onClick={() => setIsOpen(open => !open)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <span className="task-resource-picker-icon" style={{ color: selectedResource.color }}>
                    <i className={`bi ${RESOURCE_TYPE_ICONS[selectedResource.type] ?? 'bi-activity'}`} aria-hidden="true"></i>
                </span>
                <span className="task-resource-picker-copy">
                    <span className="task-resource-picker-label">{selectedResource.label}</span>
                    {selectedResource.sublabel && (
                        <span className="task-resource-picker-meta">{selectedResource.sublabel}</span>
                    )}
                </span>
                <span className="task-resource-picker-value" style={{ color: selectedResource.color }}>
                    {selectedValue}
                </span>
                <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'} task-resource-picker-chevron`} aria-hidden="true"></i>
            </button>

            {isOpen && (
                <div className="task-resource-picker-menu" role="listbox">
                    {resources.map(resourceItem => {
                        const isActive = resourceItem.key === selectedResource.key;
                        return (
                            <button
                                key={resourceItem.key}
                                type="button"
                                className={`task-resource-picker-option ${isActive ? 'task-resource-picker-option-active' : ''}`}
                                onClick={() => handleSelect(resourceItem)}
                                role="option"
                                aria-selected={isActive}
                            >
                                <span className="task-resource-picker-option-icon" style={{ color: resourceItem.color }}>
                                    <i className={`bi ${RESOURCE_TYPE_ICONS[resourceItem.type] ?? 'bi-activity'}`} aria-hidden="true"></i>
                                </span>
                                <span className="task-resource-picker-option-copy">
                                    <span className="task-resource-picker-option-label">{resourceItem.label}</span>
                                    {resourceItem.sublabel && (
                                        <span className="task-resource-picker-option-meta">{resourceItem.sublabel}</span>
                                    )}
                                </span>
                                <span className="task-resource-picker-option-value">
                                    {getSidebarValue(resourceItem, metrics, history)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
