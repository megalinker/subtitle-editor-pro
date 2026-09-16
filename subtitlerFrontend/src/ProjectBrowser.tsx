import React from 'react';
import { Project } from './types';
import './ProjectBrowser.css'; // You can keep the file but we override styles in App.css

interface ProjectBrowserProps {
    projects: Project[];
    onLoadProject: (projectId: string) => void;
    onCreateNew: () => void;
    onDeleteProject: (projectId: string) => void;
}

export const ProjectBrowser: React.FC<ProjectBrowserProps> = ({ projects, onLoadProject, onCreateNew, onDeleteProject }) => {
    return (
        <div className="app-container" style={{ overflowY: 'auto' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '2rem' }}>
                <div className="app-header" style={{ background: 'transparent', border: 'none', padding: '0' }}>
                    <div>
                        <h1>My Projects</h1>
                        <p>Manage your transcription workspace</p>
                    </div>
                    <button onClick={onCreateNew} className="primary">
                        <span>+</span> New Project
                    </button>
                </div>

                {projects.length > 0 ? (
                    <div className="project-grid">
                        {projects.sort((a, b) => b.updatedAt - a.updatedAt).map(project => (
                            <div key={project.id} className="project-card-modern">
                                <h3 className="card-title" onClick={() => onLoadProject(project.id)} style={{cursor: 'pointer'}}>{project.name}</h3>
                                <p className="card-meta">{project.fileSignature.name}</p>
                                <p className="card-meta">
                                    Edited {new Date(project.updatedAt).toLocaleDateString()}
                                </p>
                                <div className="card-actions">
                                    <button onClick={() => onLoadProject(project.id)} style={{flex: 1}}>Open</button>
                                    <button onClick={() => onDeleteProject(project.id)} style={{color: 'var(--danger)', background: 'rgba(239,68,68,0.1)'}}>
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state" style={{ marginTop: '4rem', border: '1px dashed var(--border)' }}>
                        <h2>Start your first transcription</h2>
                        <p>Upload a video or audio file to begin.</p>
                        <br />
                        <button onClick={onCreateNew} className="primary">Create Project</button>
                    </div>
                )}
            </div>
        </div>
    );
};