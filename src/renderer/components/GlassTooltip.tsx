import React, {useState, useRef, useCallback, useEffect} from 'react';
import {createPortal} from 'react-dom';

interface GlassTooltipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    delay?: number;
    offset?: number;
}

const GlassTooltip: React.FC<GlassTooltipProps> = ({
    content,
    children,
    delay = 400,
    offset = 8
}) => {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState<{top: number; left: number}>({top: 0, left: 0});
    const triggerRef = useRef<HTMLElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        
        const rect = triggerRef.current.getBoundingClientRect();
        
        // Показываем тултип снизу от элемента, по центру
        const top = rect.bottom + offset;
        const left = rect.left + rect.width / 2;

        setPosition({top, left});
    }, [offset]);

    const showTooltip = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            setVisible(true);
        }, delay);
    }, [delay]);

    const hideTooltip = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setVisible(false);
    }, []);

    useEffect(() => {
        if (!visible) return;
        
        updatePosition();
        
        // Обновляем позицию при скролле или ресайзе
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [visible, updatePosition]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const handleMouseEnter = useCallback((e: React.MouseEvent) => {
        showTooltip();
        children.props.onMouseEnter?.(e);
    }, [showTooltip, children.props]);

    const handleMouseLeave = useCallback((e: React.MouseEvent) => {
        hideTooltip();
        children.props.onMouseLeave?.(e);
    }, [hideTooltip, children.props]);

    const handleFocus = useCallback((e: React.FocusEvent) => {
        showTooltip();
        children.props.onFocus?.(e);
    }, [showTooltip, children.props]);

    const handleBlur = useCallback((e: React.FocusEvent) => {
        hideTooltip();
        children.props.onBlur?.(e);
    }, [hideTooltip, children.props]);

    const setRef = useCallback((node: HTMLElement | null) => {
        triggerRef.current = node;
        // Поддерживаем ref из children если он есть
        const childRef = (children as any).ref;
        if (typeof childRef === 'function') {
            childRef(node);
        } else if (childRef && typeof childRef === 'object') {
            (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
    }, [children]);

    const child = React.cloneElement(children, {
        ref: setRef,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onFocus: handleFocus,
        onBlur: handleBlur
    });

    const tooltipElement = visible ? (
        <div
            ref={tooltipRef}
            className="fixed z-[9999] pointer-events-none"
            style={{
                top: position.top,
                left: position.left,
                transform: 'translate(-50%, 0)'
            }}
        >
            <div className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/90 whitespace-nowrap backdrop-blur-xl bg-black/75 border border-white/10 shadow-lg shadow-black/25 animate-tooltip-fade-in">
                {content}
            </div>
        </div>
    ) : null;

    return (
        <>
            {child}
            {tooltipElement && createPortal(tooltipElement, document.body)}
        </>
    );
};

export default GlassTooltip;
