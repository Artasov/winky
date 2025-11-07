import React from 'react';
import MainWindow from './MainWindow';

const MicWindow: React.FC = () => {
  return (
    <div className="h-full w-full bg-transparent" style={{ overflow: 'visible' }}>
      <MainWindow />
    </div>
  );
};

export default MicWindow;
