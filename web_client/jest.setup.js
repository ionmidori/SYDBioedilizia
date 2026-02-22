console.log('--- JEST SETUP EXECUTING ---');
// Polyfill TextEncoder/TextDecoder (MUST BE AT TOP)
const { TextEncoder, TextDecoder } = require('node:util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

if (typeof window !== 'undefined') {
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
}
console.log('TextDecoder polyfill applied:', !!global.TextDecoder);

// ✅ PILLAR 1 FIX: Properly import testing-library matchers
// This extends Jest's expect() with custom matchers like toBeInTheDocument()
import '@testing-library/jest-dom';

// ✅ Mock Firebase SDK modules to prevent real initialization during tests
jest.mock('firebase/app', () => ({
    initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })),
    getApps: jest.fn(() => []),
    getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

jest.mock('firebase/auth', () => ({
    getAuth: jest.fn(() => ({
        currentUser: null,
        onAuthStateChanged: jest.fn(),
    })),
    setPersistence: jest.fn(() => Promise.resolve()),
    browserLocalPersistence: {},
    onAuthStateChanged: jest.fn((auth, callback) => {
        // Call callback with null user by default
        setTimeout(() => callback(null), 0);
        // Return unsubscribe function
        return jest.fn();
    }),
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: {} })),
    signOut: jest.fn(() => Promise.resolve()),
    createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: {} })),
}));

jest.mock('firebase/firestore', () => ({
    getFirestore: jest.fn(() => ({})),
    collection: jest.fn(),
    doc: jest.fn(),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    getDocs: jest.fn(),
    enableMultiTabIndexedDbPersistence: jest.fn(() => Promise.resolve()),
    onSnapshot: jest.fn(),
    increment: jest.fn(),
    serverTimestamp: jest.fn(() => new Date()),
}));

jest.mock('firebase/storage', () => ({
    getStorage: jest.fn(() => ({})),
    ref: jest.fn(),
    uploadBytes: jest.fn(),
    getDownloadURL: jest.fn(),
}));

jest.mock('firebase/app-check', () => ({
    initializeAppCheck: jest.fn(() => ({})),
    ReCaptchaV3Provider: jest.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
    let store = {};

    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

// Mock crypto.randomUUID (not available in JSDOM < Node 19)
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID === 'undefined') {
    Object.defineProperty(globalThis, 'crypto', {
        value: {
            randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            }),
            getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; },
        },
        writable: true,
        configurable: true,
    });
}

// Mock ResizeObserver (not implemented in JSDOM)
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock window.matchMedia (not implemented in JSDOM)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

// Mock visualViewport for mobile tests
Object.defineProperty(window, 'visualViewport', {
    value: {
        height: 800,
        width: 375,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    },
    writable: true,
});

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();
window.scrollTo = jest.fn();

// Mock fetch with smart endpoint handling
global.fetch = jest.fn((input) => {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input?.url || '');

    // Auto-handle history endpoint to prevent useEffect failures
    if (url.includes('/api/chat/history')) {
        return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
        });
    }

    // Default mock for other endpoints
    return Promise.resolve({
        ok: true,
        body: {
            getReader: () => ({
                read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
            }),
        },
    });
});



// Mock FileReader
global.FileReader = jest.fn().mockImplementation(() => ({
    readAsDataURL: jest.fn(),
    onloadend: null,
    onerror: null,
    result: null,
}));

