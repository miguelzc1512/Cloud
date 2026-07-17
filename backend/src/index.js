"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
const storagePath = process.env.STORAGE_PATH || '../storage';
// Ensure storage directory exists
const absoluteStoragePath = path_1.default.resolve(__dirname, '..', storagePath);
if (!fs_1.default.existsSync(absoluteStoragePath)) {
    fs_1.default.mkdirSync(absoluteStoragePath, { recursive: true });
}
// Database file path
const dbFilePath = path_1.default.resolve(__dirname, '..', 'database.json');
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, absoluteStoragePath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = (0, multer_1.default)({ storage });
// Helper to read database safely
const readDatabase = async () => {
    try {
        const data = await fs_1.default.promises.readFile(dbFilePath, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};
// Helper to write database safely
const writeDatabase = async (data) => {
    await fs_1.default.promises.writeFile(dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
};
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const fileMeta = {
            id: Date.now().toString(),
            originalName: req.file.originalname,
            savedName: req.file.filename,
            mimeType: req.file.mimetype,
            size: req.file.size,
            createdAt: new Date().toISOString()
        };
        const db = await readDatabase();
        db.push(fileMeta);
        await writeDatabase(db);
        res.status(201).json(fileMeta);
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});
app.get('/api/files', async (req, res) => {
    try {
        const db = await readDatabase();
        res.json(db);
    }
    catch (error) {
        console.error('Fetch files error:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
//# sourceMappingURL=index.js.map