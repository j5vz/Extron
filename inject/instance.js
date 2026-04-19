"use strict";

const Instance = {
    GetName(addr) {
        const ptr = Memory.ReadU32(addr + Offsets.INSTANCE_NAME);
        return Memory.ReadStdString(ptr);
    },

    SetName(addr, name) {
        const target = Memory.ReadU32(addr + Offsets.INSTANCE_NAME);
        const namePtr = Memory.AllocateString(name);

        // check if it's a long string/heap allocated (0x80 flag)
        if (Memory.ReadU8(target + 11) === 0x80) {
            const old = Memory.ReadU32(target);
            if (old) wasmExports.free(old);
        }

        Memory.WriteU32(target, namePtr);
        Memory.WriteU32(target + 4, name.length);
        Memory.WriteU8(target + 11, 0x80);
    },

    GetClassName(addr) {
        const desc = Memory.ReadU32(addr + Offsets.INSTANCE_DESCRIPTOR);
        const rbxName = Memory.ReadU32(desc + Offsets.DESCRIPTOR_NAME);
        return Memory.ReadStdString(rbxName + 4);
    },

    GetParent(addr) {
        return Memory.ReadU32(addr + Offsets.INSTANCE_PARENT);
    },

    GetChildren(addr) {
        const children = [];
        const vector = Memory.ReadU32(addr + Offsets.INSTANCE_CHILDREN);
    
        if (!vector) return children;
    
        const start = Memory.ReadU32(vector);
        const end = Memory.ReadU32(vector + 4);
    
        if (!start || !end) return children;
    
        // 8 bytes per shared_ptr in wasm32
        for (let i = start; i < end; i += 8) {
            const child = Memory.ReadU32(i);
            if (child) children.push(child);
        }
    
        return children;
    },

    DeepPrint(addr, depth = 0) {
        // keep this for debugging but don't call it in production
        // game scripts can't see this unless they hook console.log
    }
};
