import React, { useEffect, useState } from 'react';
import SideBar from "../components/SideBar";
import Header from "../components/Header";

function Main() {
    return (
        <div className="d-flex vh-100 overflow-hidden">
            <SideBar />
            <div className="d-flex flex-column flex-grow-1">
                <Header>

                </Header>
            </div>
        </div>
    )
}

export default Main
