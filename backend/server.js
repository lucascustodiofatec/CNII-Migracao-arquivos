// node-backend/server.js

const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { google } = require('googleapis');
const { BlobServiceClient } = require('@azure/storage-blob');
const { Readable } = require('stream');
const cors = require('cors'); // Adicionado para CORS mais robusto

// Carrega variáveis de ambiente do arquivo .env (para uso local)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configurações e Variáveis
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME;
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
const GOOGLE_FOLDER_ID = process.env.GOOGLE_FOLDER_ID;
const DRIVE_SCOPE = ['https://www.googleapis.com/auth/drive'];

// Configuração de Autenticação Azure
const blobServiceClient = AZURE_STORAGE_CONNECTION_STRING 
    ? BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING) 
    : null;

// Use o middleware CORS oficial
app.use(cors()); 

// Middleware para JSON
app.use(express.json());

// --- FUNÇÕES DE SERVIÇO ---

/**
 * @function getGoogleAuth
 * @description Configura e retorna o cliente JWT para autenticação no Google Drive.
 */
function getGoogleAuth() {
    let creds;
    try {
        creds = JSON.parse(GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
    } catch (e) {
        throw new Error("Credenciais do Google Drive inválidas ou ausentes.");
    }

    return new google.auth.JWT(
        creds.client_email,
        null,
        creds.private_key,
        DRIVE_SCOPE,
    );
}

/**
 * @function formatarTamanho
 * @description Função auxiliar para formatar bytes em KB, MB, GB.
 */
function formatarTamanho(bytes) {
    if (bytes === 0 || bytes === null || bytes === undefined) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 📌 NOVO MÉTODO PARA GARANTIR A EXISTÊNCIA DO CONTAINER
/**
 * @function ensureContainerExists
 * @description Verifica se o container do Azure existe e o cria se necessário.
 */
async function ensureContainerExists(containerName) {
    if (!blobServiceClient) {
        throw new Error("Cliente Azure Blob Service não inicializado. Verifique a Connection String.");
    }
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Tenta criar o container. Se ele já existir, nenhuma exceção é lançada.
    try {
        await containerClient.createIfNotExists();
        console.log(`[Azure] Container '${containerName}' verificado/criado com sucesso.`);
    } catch (e) {
        // Loga a falha, mas permite que o erro de autenticação (se for o caso) seja propagado.
        console.error(`[Azure] Falha ao criar/verificar container: ${e.message}`);
        throw e; // Lança o erro para ser capturado pela rota.
    }
}


/**
 * @function listarGoogleDrive
 * @description Lista arquivos de uma pasta específica no Google Drive.
 */
async function listarGoogleDrive() {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.list({
        q: `'${GOOGLE_FOLDER_ID}' in parents and trashed=false`, 
        fields: 'files(id, name, size, mimeType)',
        pageSize: 10,
    });

    const arquivos = response.data.files.map(file => ({
        id: file.id,
        nome: file.name,
        tamanho: file.size ? formatarTamanho(parseInt(file.size)) : '0 B',
        sizeBytes: file.size ? parseInt(file.size) : 0, 
        tipo: file.mimeType
    }));

    return arquivos;
}

/**
 * @function listarAzureBlob
 * @description Lista os blobs (arquivos) dentro de um contêiner no Azure.
 */
async function listarAzureBlob() {
    // 1. Garante que o container existe
    await ensureContainerExists(AZURE_CONTAINER_NAME);

    const containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);

    // 2. Listagem de Arquivos
    let arquivos = [];
    
    for await (const blob of containerClient.listBlobsFlat()) {
        arquivos.push({
            nome: blob.name,
            tamanho: blob.properties.contentLength ? formatarTamanho(blob.properties.contentLength) : '0 B',
            data_criacao: blob.properties.creationTime.toISOString().split('T')[0],
        });
    }

    return arquivos;
}

/**
 * @function transferirArquivo
 * @description Implementa a migração: Baixa o arquivo do Drive e faz o upload para o Blob Storage.
 */
async function transferirArquivo(fileId, fileName) {
    // 1. Garante que o container existe antes de tentar o upload
    await ensureContainerExists(AZURE_CONTAINER_NAME);
    
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    const containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // 2. Baixar o arquivo do Google Drive
    const driveResponse = await drive.files.get({
        fileId: fileId,
        alt: 'media' 
    }, { responseType: 'stream' });

    const driveStream = driveResponse.data;
    
    // Converte o stream para Buffer para upload simplificado
    let buffer = [];
    await new Promise((resolve, reject) => {
        driveStream.on('data', chunk => buffer.push(chunk));
        driveStream.on('end', resolve);
        driveStream.on('error', reject);
    });
    const fileBuffer = Buffer.concat(buffer);

    // **Exibe no console o status da transferência (Início)**
    console.log(`[STATUS] Transferência iniciada: Drive ID ${fileId} -> Blob ${fileName}. Tamanho: ${formatarTamanho(fileBuffer.length)}`);
    
    // 3. Upload do Buffer para o Azure Blob
    await blockBlobClient.upload(fileBuffer, fileBuffer.length);

    // **Exibe no console o status da transferência (Sucesso)**
    console.log(`[STATUS] Transferência concluída com SUCESSO: Blob ${fileName}`);
    
    return { status: 'sucesso', mensagem: `Arquivo ${fileName} migrado com sucesso.` };
}

// --- ROTAS DA API ---

app.get('/api/google-drive', async (req, res) => {
    try {
        const arquivos = await listarGoogleDrive();
        res.json(arquivos);
    } catch (error) {
        console.error("Erro ao listar Google Drive:", error.message);
        res.status(500).json({ 
            erro: "Falha na conexão ou autenticação do Google Drive.", 
            detalhe: error.message 
        });
    }
});

app.get('/api/azure-blob', async (req, res) => {
    try {
        const arquivos = await listarAzureBlob();
        res.json(arquivos);
    } catch (error) {
        console.error("Erro ao listar Azure Blob:", error.message);
        res.status(500).json({ 
            erro: "Falha na conexão ou autenticação do Azure Blob Storage.", 
            // O erro de autenticação/chave é mais provável
            detalhe: "Verifique a Connection String e o nome do Container. Detalhe: " + error.message 
        });
    }
});

app.post('/api/transferir', async (req, res) => {
    const { fileId, fileName } = req.body; 
    
    if (!fileId || !fileName) {
        return res.status(400).json({ status: 'erro', mensagem: 'ID e Nome do arquivo são obrigatórios.' });
    }

    try {
        const resultado = await transferirArquivo(fileId, fileName);
        res.json(resultado);
    } catch (error) {
        console.error(`[STATUS] Transferência do arquivo ID: ${fileId} falhou. Erro: ${error.message}`);
        res.status(500).json({ 
            status: 'erro', 
            mensagem: `Falha ao migrar ${fileName}.`, 
            detalhe: error.message 
        });
    }
});

// Configuração para Vercel: Exporta a aplicação
module.exports = app;

// Execução local
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Servidor Node.js rodando localmente na porta ${PORT}`);
    });
}