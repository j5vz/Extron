"use strict";

console.log("[Main] init");

// global killswitch
window.EXTRON_ACTIVE = true;

window.Panic = function() {
    window.EXTRON_ACTIVE = false;
    
    // wipe the queue so nothing else fires
    if (typeof MainLoop !== "undefined" && MainLoop.queue) {
        MainLoop.queue = MainLoop.queue.filter(task => 
            task.name !== "ExecuteScript" && task.name !== "SendError"
        );
    }

    const ui = document.getElementById('extron-root');
    if (ui) ui.remove();

    console.warn("panic: killed all processes.");
};

let Main = {
    SPAWN: 4596,
    INSTANCE_NEW: 4168,

    scriptContext: 0,
    executorGlobalState: 0,
    inverseCache: 0n,

    Inverse(a, n) {
        let t = 0n, newt = 1n, r = n, newr = a;
        while (newr != 0n) {
            let q = r / newr;
            let curt = t; t = newt; newt = (curt - q * newt) & 0xFFFFFFFFFFFFFFFFn;
            let curr = r; r = newr; newr = (curr - q * newr) & 0xFFFFFFFFFFFFFFFFn;
        }
        return (t < 0n) ? (t + n) & 0xFFFFFFFFFFFFFFFFn : t;
    },

    EncodeInstructions(proto) {
        if (!window.EXTRON_ACTIVE) return;
        for (let i = 0; i < proto.instructions.length; i++) {
            proto.instructions[i] = Number((BigInt(proto.instructions[i]) * Main.inverseCache) & 0xFFFFFFFFn);
        }
        for (let i = 0; i < proto.protos.length; i++) {
            proto.protos[i].source = proto.source;
            Main.EncodeInstructions(proto.protos[i]);
        }
    },

    ValidateScriptContext(sc) {
        return Memory.ReadU32(sc) === Offsets.SCRIPT_CONTEXT_VTABLE && 
               Memory.ReadU32(sc + Offsets.INSTANCE_DESCRIPTOR) === Offsets.SCRIPT_CONTEXT_DESCRIPTOR;
    },

    FindOrGetScriptContext() {
        if (Main.scriptContext) return Main.scriptContext;
        if (typeof GROWABLE_HEAP_U32 == "undefined") return 0;

        let heap = GROWABLE_HEAP_U32();
        for (let i = 0; i < heap.length; i++) {
            if (heap[i] === Offsets.SCRIPT_CONTEXT_VTABLE && Main.ValidateScriptContext(i << 2)) {
                Main.scriptContext = i << 2;
                break;
            }
        }
        return Main.scriptContext;
    },

    InitOrGetExploitState() {
        if (!window.EXTRON_ACTIVE) return 0;
        if (Main.executorGlobalState) return Main.executorGlobalState;
        if (!Main.scriptContext) return 0;

        const GLOBAL_STATE = Memory.ReadU32(Main.scriptContext + Offsets.SCRIPT_CONTEXT_GLOBAL_STATE);
        if (!GLOBAL_STATE) return 0;

        const GT = Lua.gt(GLOBAL_STATE);
        if (!GT) return 0;

        Main.inverseCache = Main.Inverse(BigInt(Memory.ReadU32(GT + Offsets.GLOBAL_STATE_CKEY) + (GT + Offsets.GLOBAL_STATE_CKEY)) & 0xFFFFFFFFn, 1n << 32n) & 0xFFFFFFFFn;
        Main.executorGlobalState = Lua.newthread(GLOBAL_STATE);

        if (!Main.executorGlobalState) return 0;

        Lua.LockObject(Main.executorGlobalState);
        Lua.SetThreadIdentityAndSandbox(Main.executorGlobalState, 7);
        Lua.setfield(GLOBAL_STATE, Lua.REGISTRYINDEX, "_GLOBAL_STATE_DO_NOT_REMOVE_");
        
        Custom.InstallFunctions(Main.executorGlobalState);
        return Main.executorGlobalState;
    },
    
    CreateProto(L, protoData) {
        const proto = Lua.alloc(L, 76);
        Lua.link(L, proto, Lua.type.PROTO);
        
        const constants = Lua.alloc(L, protoData.constants.length * 16);
        const protos = Lua.alloc(L, protoData.protos.length * 4);
        const code = Lua.alloc(L, (protoData.instructions.length + 1) * 4);
        const upvalues = Lua.alloc(L, protoData.upvalueNames.length * 4);
        const lineinfo = Lua.alloc(L, protoData.lineInfo.length * 4);
        const locvars = Lua.alloc(L, protoData.localVars.length * 12);
        const source = Lua.newlstr(L, protoData.source);
        
        protoData.instructions.forEach((v, k) => Memory.WriteU32(code + k * 4, v));
        protoData.lineInfo.forEach((v, k) => Memory.WriteU32(lineinfo + k * 4, v));
        protoData.protos.forEach((v, k) => Memory.WriteU32(protos + k * 4, Main.CreateProto(L, v)));
        protoData.upvalueNames.forEach((v, k) => Memory.WriteU32(upvalues + k * 4, Lua.newlstr(L, v)));
        
        // tag for checkclosure
        Memory.WriteU32(code + protoData.instructions.length * 4, 0xFFFFFFFF);

        for (let i = 0; i < protoData.constants.length; i++) {
            let data = protoData.constants[i], addr = constants + i * 16;
            switch (data[0]) {
                case 0: Memory.WriteU64(addr, 0n); Memory.WriteU32(addr + 8, Lua.type.NIL); break;
                case 1: Memory.WriteU32(addr, data[1] + 0); Memory.WriteU32(addr + 8, Lua.type.BOOLEAN); break;
                case 3: 
                    for (let j = 0; j < 8; j++) Memory.WriteU8(addr + j, data[1].charCodeAt(j));
                    Memory.WriteU32(addr + 8, Lua.type.NUMBER);
                    break;
                case 4: Memory.WriteU32(addr, Lua.newlstr(L, data[1])); Memory.WriteU32(addr + 8, Lua.type.STRING); break;
            }
        }

        for (let i = 0; i < protoData.localVars.length; i++) {
            Memory.WriteU32(locvars + i * 12, Lua.newlstr(L, protoData.localVars[i][0]));
            Memory.WriteU32(locvars + i * 12 + 4, protoData.localVars[i][1]);
            Memory.WriteU32(locvars + i * 12 + 8, protoData.localVars[i][2]);
        }

        Memory.WriteU32(proto + Offsets.PROTO_K, constants - (proto + Offsets.PROTO_K));
        Memory.WriteU32(proto + Offsets.PROTO_SIZEK, protoData.constants.length);
        Memory.WriteU32(proto + Offsets.PROTO_P, protos - (proto + Offsets.PROTO_P));
        Memory.WriteU32(proto + Offsets.PROTO_SIZEP, protoData.protos.length);
        Memory.WriteU32(proto + Offsets.PROTO_CODE, code - (proto + Offsets.PROTO_CODE));
        Memory.WriteU32(proto + Offsets.PROTO_SIZECODE, protoData.instructions.length);
        Memory.WriteU32(proto + Offsets.PROTO_SIZELINEINFO, protoData.lineInfo.length);
        Memory.WriteU32(proto + Offsets.PROTO_SIZEUPVALUES, protoData.upvalueNames.length);
        Memory.WriteU8(proto + Offsets.PROTO_NUPS, protoData.numUpvalues);
        Memory.WriteU32(proto + Offsets.PROTO_UPVALUES, upvalues - (proto + Offsets.PROTO_UPVALUES));
        Memory.WriteU8(proto + Offsets.PROTO_NUMPARAMS, protoData.numParams);
        Memory.WriteU8(proto + Offsets.PROTO_IS_VARARG, protoData.isVararg);
        Memory.WriteU8(proto + Offsets.PROTO_MAXSTACKSIZE, protoData.maxStackSize);
        Memory.WriteU32(proto + Offsets.PROTO_LINEINFO, lineinfo - (proto + Offsets.PROTO_LINEINFO));
        Memory.WriteU32(proto + Offsets.PROTO_SIZELOCVARS, protoData.localVars.length);
        Memory.WriteU32(proto + Offsets.PROTO_LOCVARS, locvars - (proto + Offsets.PROTO_LOCVARS));
        Memory.WriteU32(proto + Offsets.PROTO_SOURCE, source - (proto + Offsets.PROTO_SOURCE));

        return proto;
    },

    CreateLClosure(L, proto) {
        const lcl = Lua.alloc(L, 0x14);
        Lua.link(L, lcl, Lua.type.FUNCTION);
        Memory.WriteU8(lcl + Offsets.CLOSURE_IS_C, 0);
        Memory.WriteU8(lcl + Offsets.CLOSURE_NUPVALUES, 0);
        Memory.WriteU32(lcl + Offsets.CLOSURE_GCLIST, 0);
        Memory.WriteU32(lcl + Offsets.CLOSURE_ENV, Memory.ReadU32(Lua.index2adr(L, Lua.GLOBALSINDEX)));
        Memory.WriteU32(lcl + Offsets.LCLOSURE_P, proto - (lcl + Offsets.LCLOSURE_P));
        return lcl;
    },

    ExecuteScript(bytecodeData) {
        if (!window.EXTRON_ACTIVE) return;
        const state = Main.InitOrGetExploitState();
        if (!state) return console.error("state fail");

        Main.EncodeInstructions(bytecodeData.main);
        const L = Lua.newthread(state);
        Lua.SetThreadIdentityAndSandbox(L, 7);

        Lua.pushcfunction(L, Lua.internal.FindFunctionIndex(Main.INSTANCE_NEW));
        Lua.pushstring(L, "LocalScript");
        Lua.pcall(L, 1, 1);
        
        const instance = Memory.ReadU32(Lua.topointer(L, -1) + Offsets.UDATA_DATA_BEGIN);
        Instance.SetName(instance, bytecodeData.main.source.substr(1));

        Lua.setglobal(L, "script");
        Lua.settop(L, 0);

        Lua.pushcfunction(L, Lua.internal.FindFunctionIndex(Main.SPAWN));
        Lua.WriteAndIncrementTop(L, Main.CreateLClosure(L, Main.CreateProto(L, bytecodeData.main)), Lua.type.FUNCTION);
        Lua.pcall(L, 1, 0, 0);
        
        Lua.settop(L, 0);
        Lua.pop(state, 1);
    },

    WriteError(err) {
        if (!window.EXTRON_ACTIVE) return;
        const state = Main.InitOrGetExploitState();
        if (!state) return;
        Lua.getglobal(state, "warn");
        Lua.pushstring(state, err);
        Lua.pcall(state, 1, 0, 0);
    }
};

// handling messages from the ui/background
window.addEventListener("compileError", ({ detail }) => {
    if (!window.EXTRON_ACTIVE) return;
    if (!Main.FindOrGetScriptContext() || typeof MainLoop == "undefined") return;
    MainLoop.queue.push({ name: "SendError", func: Main.WriteError, arg: detail.error });
});

window.addEventListener("execute", ({ detail }) => {
    if (!window.EXTRON_ACTIVE) return;
    console.log("executing script");
    if (!Main.FindOrGetScriptContext() || typeof MainLoop == "undefined") {
        console.error("no loop/context");
        return;
    }

    let [ result, err ] = Bytecode.Parse(detail.bytecode);
    if (err) {
        MainLoop.queue.push({ name: "SendError", func: Main.WriteError, arg: err });
        return;
    }

    result.main.source = `${detail.source}`;
    MainLoop.queue.push({ name: "ExecuteScript", func: Main.ExecuteScript, arg: result });
});

// wasm table hook
let resumeMainLoopValue = undefined;
setTimeout(() => {
    if (typeof Module === "undefined") return;
    Object.defineProperty(Module, "resumeMainLoop", {
        get: () => resumeMainLoopValue,
        set: (v) => {
            if (resumeMainLoopValue !== undefined) return v;
            resumeMainLoopValue = v;
            Custom.Init();
            return v;
        }
    });
}, 20);
