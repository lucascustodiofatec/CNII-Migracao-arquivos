// react-frontend/src/FileTable.js

import React from 'react';
import './FileTable.css'; 

const FileTable = ({ title, status, files, storageType, onMigrate }) => {
    const isDrive = storageType === 'drive';

    return (
        <section className="storage-panel">
            <h2>{title}</h2>
            <p className={`status ${status.includes('ERRO') ? 'error' : 'ok'}`}>{status}</p>
            
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Tamanho</th>
                            {isDrive ? <th>Tipo</th> : <th>Criação</th>}
                            {/* O botão de migração só aparece no Google Drive (Origem) */}
                            {isDrive && <th>Ação</th>} 
                        </tr>
                    </thead>
                    <tbody>
                        {files.length === 0 && (
                            <tr>
                                <td colSpan={isDrive ? 4 : 3}>
                                    {status.includes('Carregando') ? 'Carregando arquivos...' : 'Nenhum arquivo encontrado.'}
                                </td>
                            </tr>
                        )}
                        {files.map((file, index) => (
                            <tr key={index}>
                                <td>{file.nome}</td>
                                <td>{file.tamanho}</td>
                                {isDrive ? <td>{file.tipo}</td> : <td>{file.data_criacao}</td>}
                                {isDrive && (
                                    <td>
                                        {/* Botão de migração que chama a função passada pelo App.js */}
                                        <button 
                                            onClick={() => onMigrate(file.id, file.nome)}
                                            className="migrate-button"
                                            disabled={file.sizeBytes === 0} // Desabilita para pastas/atalhos
                                            title={file.sizeBytes === 0 ? "Apenas arquivos podem ser migrados" : "Migrar para Azure Blob"}
                                        >
                                            Migrar
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default FileTable;