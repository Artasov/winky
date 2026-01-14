import React, {useMemo} from 'react';

interface MicVolumeRingsProps {
    isRecording: boolean;
    normalizedVolume: number;
}

// Используем 4 круга: большие круги видны при максимальном звуке, маленькие - при среднем
const ringMultipliers = [4, 3, 2, 1];

const MicVolumeRingsComponent: React.FC<MicVolumeRingsProps> = ({isRecording, normalizedVolume}) => {
    // Размер микрофона: default = 80px (h-20), compact = 56px (h-14)
    const micSize = isRecording ? 56 : 80;
    
    // Формула для чувствительности волн - более сдержанная для средних звуков:
    // - При тихом звуке (малый normalizedVolume) - умеренная чувствительность
    // - При громком звуке (большой normalizedVolume) - низкая чувствительность (амплитуда сохранена)
    // Используем менее агрессивную формулу для более спокойной анимации
    const baseWaveScale = 1.05; // Минимальный масштаб при громком звуке
    const maxAdditionalScale = 0.35; // Уменьшаем для менее агрессивного усиления
    const sqrtVolume = Math.sqrt(normalizedVolume); // Квадратный корень для более плавного перехода
    const waveScale = useMemo(() => baseWaveScale + (1 - sqrtVolume) * maxAdditionalScale, [sqrtVolume]);
    
    // Для opacity используем более сдержанное преобразование
    const logVolume = useMemo(() => {
        if (normalizedVolume <= 0) return 0;
        // Используем логарифмическую формулу для плавного и сдержанного эффекта
        return Math.log1p(normalizedVolume * 3) / Math.log1p(3);
    }, [normalizedVolume]);
    
    // Минимальный порог громкости для показа кругов (повышен для устранения кругов при молчании)
    const minVolumeThreshold = 0.18; // Увеличиваем порог для более сдержанной анимации
    
    // Размер первого кольца - делаем его меньше размера микрофона, чтобы кольца начинались ближе к центру
    const firstRingSize = micSize - 12; // Вычитаем 12px, чтобы первое кольцо было заметно меньше микрофона

    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{overflow: 'visible'}}>
            {ringMultipliers.map((multiplier) => (
                <div
                    key={multiplier}
                    className="absolute rounded-full border-[3px]"
                    style={{
                        // Кольца начинаются близко к микрофону (первое кольцо меньше размера микрофона)
                        // Используем (multiplier - 1) чтобы первое кольцо (multiplier=1) было меньше размера микрофона
                        // Шаг между кольцами: 20px (как было раньше)
                        width: `${firstRingSize + (multiplier - 1) * 20}px`,
                        height: `${firstRingSize + (multiplier - 1) * 20}px`,
                        boxSizing: 'content-box',
                        borderColor: isRecording
                            ? `rgba(239, 68, 68, ${0.7 - (multiplier - 1) * 0.1})`
                            : 'rgba(16, 185, 129, 0.5)',
                        opacity: isRecording && logVolume > minVolumeThreshold
                            ? Math.max(0, (logVolume - minVolumeThreshold) / (1 - minVolumeThreshold) - (multiplier - 1) * 0.12)
                            : 0,
                        // Добавляем небольшую вариацию масштаба для разных колец, создавая волновой эффект
                        transform: `scale(${isRecording ? waveScale * (1 - (multiplier - 1) * 0.05) : 0.95})`,
                        boxShadow: isRecording
                            ? `0 0 ${5 + logVolume * 8}px ${2 + logVolume * 4}px rgba(239, 68, 68, ${0.2 + logVolume * 0.15})`
                            : 'none',
                        transition: 'opacity 0.15s ease, transform 0.15s ease'
                    }}
                />
            ))}
        </div>
    );
};

const MicVolumeRings = React.memo(MicVolumeRingsComponent);

export default MicVolumeRings;
