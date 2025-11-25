// react-frontend/src/App.js

import React, { useState, useEffect } from 'react';
import FileTable from './FileTable';
import './App.css';

// URL de base para as chamadas API
const BACKEND_URL = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5000/api' 
    : process.env.REACT_APP_BACKEND_URL; 

function App() {
    const [driveFiles, setDriveFiles] = useState([]);
    const [blobFiles, setBlobFiles] = useState([]);
    const [driveStatus, setDriveStatus] = useState('Pronto');
    const [blobStatus, setBlobStatus] = useState('Pronto');
    const [loading, setLoading] = useState(false);
    const [transferStatus, setTransferStatus] = useState(''); // Estado para exibir o status da migração

    const carregarArquivos = async () => {
        setLoading(true);
        setDriveStatus('Carregando...');
        setBlobStatus('Carregando...');
        
        // Chamada para Google Drive
        try {
            const response = await fetch(`${BACKEND_URL}/google-drive`);
            const data = await response.json();
            if (response.ok) {
                setDriveFiles(data);
                setDriveStatus(`Conectado. Total de ${data.length} arquivos.`);
            } else {
                setDriveStatus(`ERRO: ${data.erro || 'Falha desconhecida.'}`);
                setDriveFiles([]);
            }
        } catch (error) {
            console.error("Erro no Google Drive:", error);
            setDriveStatus('ERRO: Falha ao conectar ao Backend ou Google Drive.');
            setDriveFiles([]);
        }

        // Chamada para Azure Blob Storage
        try {
            const response = await fetch(`${BACKEND_URL}/azure-blob`);
            const data = await response.json();
            if (response.ok) {
                setBlobFiles(data);
                setBlobStatus(`Conectado. Total de ${data.length} blobs.`);
            } else {
                setBlobStatus(`ERRO: ${data.erro || 'Falha desconhecida.'}`);
                setBlobFiles([]);
            }
        } catch (error) {
            console.error("Erro no Azure Blob:", error);
            setBlobStatus('ERRO: Falha ao conectar ao Backend ou Azure Blob.');
            setBlobFiles([]);
        }
        
        setLoading(false);
    };

    /**
     * @function migrarArquivo
     * @description Envia uma requisição POST para o backend iniciar a migração.
     */
    const migrarArquivo = async (fileId, fileName) => {
        // Gera um nome único para o blob (evita sobrescrever)
        const targetFileName = `migrado_${Date.now()}_${fileName.replace(/[^a-z0-9.]/gi, '_')}`;
        
        setTransferStatus(`Iniciando migração de: ${fileName}...`);
        
        try {
            const response = await fetch(`${BACKEND_URL}/transferir`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fileId, fileName: targetFileName }),
            });
            
            const result = await response.json();
            
            if (response.ok) {
                setTransferStatus(`✅ SUCESSO! ${result.mensagem}. Atualizando lista do Azure...`);
                // Recarrega a lista do Azure para exibir o novo arquivo
                setTimeout(() => carregarArquivos(), 2000); 
            } else {
                setTransferStatus(`❌ ERRO! ${result.mensagem}. Detalhe: ${result.detalhe}`);
            }
        } catch (error) {
            setTransferStatus(`❌ ERRO! Falha na requisição de migração: ${error.message}`);
            console.error("Erro na migração:", error);
        }
    };


    // Carrega arquivos ao montar o componente
    useEffect(() => {
        carregarArquivos();
    }, []);

    return (
        <div className="App">
            <header>
                <h1>☁️ Ferramenta de Comparação e Migração Cloud</h1>
                <p>Google Drive (Node.js) ↔ Azure Blob Storage (React)</p>
                <div className="button-group">
                    <button 
                        onClick={carregarArquivos} 
                        disabled={loading}
                    >
                        {loading ? 'Atualizando...' : 'Atualizar Listas'}
                    </button>
                </div>
            </header>
            
            <p className={`transfer-status ${transferStatus.includes('ERRO') ? 'error' : transferStatus.includes('SUCESSO') ? 'success' : ''}`}>
                {transferStatus || 'Selecione um arquivo para migrar.'}
            </p>
            
            <main className="container">
                {/* FileTable para Google Drive */}
                <FileTable 
                    title="Google Drive (Origem)" 
                    status={driveStatus} 
                    files={driveFiles} 
                    storageType="drive" 
                    onMigrate={migrarArquivo} // Passa a função de migração
                />
                
                {/* FileTable para Azure Blob Storage */}
                <FileTable 
                    title="Azure Blob Storage (Destino)" 
                    status={blobStatus} 
                    files={blobFiles} 
                    storageType="blob" 
                />
            </main>
        </div>
    );
}

export default App;