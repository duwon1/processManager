import React, { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import SideBar from './SideBar';
import { AppLayoutContext, DEFAULT_HEADER } from '../hooks/useAppHeader';

function AppLayout() {
    const [header, setHeader] = useState(DEFAULT_HEADER);
    const contextValue = useMemo(() => ({ setHeader }), []);

    return (
        <AppLayoutContext.Provider value={contextValue}>
            <div className="d-flex vh-100 overflow-hidden">
                <SideBar />

                <div className="app-content-shell d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
                    <Header {...header} />
                    <Outlet />
                </div>
            </div>
        </AppLayoutContext.Provider>
    );
}

export default AppLayout;
