"use strict";

const srcInput = document.getElementById("source");

const generateId = () => {
    const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let out = "";
    for (let i = 0; i < 32; i++) {
        out += charset[Math.floor(Math.random() * charset.length)];
    }
    return out;
};

const dispatch = async (payload) => {
    const targets = await chrome.tabs.query({
        url: "https://ecsr.io/WebPlayer*"
    });

    if (targets[0]?.id) {
        chrome.tabs.sendMessage(targets[0].id, payload);
    }
};

document.getElementById("execute").onclick = async () => {
    const raw = srcInput.value;
    if (!raw) return;

    const chunkName = `=${generateId()}`;

    const res = await chrome.runtime.sendMessage({
        type: "compile",
        code: raw,
        source: chunkName
    });

    if (!res?.bytecode) {
        await dispatch({ 
            type: "sys_log", 
            level: "err", 
            msg: "null_res" 
        });
        return;
    }

    if (res.bytecode.charCodeAt(0) !== 0x1B) {
        await dispatch({ 
            type: "sys_log", 
            level: "err", 
            msg: res.bytecode 
        });
    } else {
        await dispatch({
            type: "internal_sync",
            data: btoa(res.bytecode),
            ref: chunkName
        });
    }
};

document.getElementById("clear").onclick = () => {
    srcInput.value = "";
};

document.getElementById("open").onclick = () => {
    //
};
// 67 zomgs