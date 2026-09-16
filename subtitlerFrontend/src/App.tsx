import { useState, useMemo } from 'react';
import { Project } from './types';
import { useProjects } from './useProjects';
import { ProjectBrowser } from './ProjectBrowser';
import { EditorView } from './EditorView';
import './App.css';
import './ProjectBrowser.css';

const showFilePicker = (): Promise<File> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,video/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) resolve(file);
      else reject(new Error("File picker cancelled"));
    };
    // Handle the case where the user closes the dialog
    input.addEventListener('cancel', () => reject(new Error("File picker cancelled")));
    input.click();
  });
};

function App() {
  const { projects, createNewProject, updateProject, deleteProject } = useProjects();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [initialFile, setInitialFile] = useState<File | null>(null);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || null;
  }, [projects, activeProjectId]);

  const handleCreateNew = async () => {
    try {
      const file = await showFilePicker();
      const newProject = createNewProject(file);
      setInitialFile(file); // <-- Store the file in state
      setActiveProjectId(newProject.id);
    } catch (err) {
      console.log("File picker cancelled");
    }
  };

  const handleLoadProject = (projectId: string) => {
    setInitialFile(null); // <-- Ensure no initial file when loading an old project
    setActiveProjectId(projectId);
  };

  const handleCloseEditor = () => {
    setActiveProjectId(null);
    setInitialFile(null); // <-- Clear the initial file on close
  };

  const handleSaveProject = (projectData: Project) => {
    updateProject(projectData);
  };

  if (!activeProject) {
    return (
      <ProjectBrowser
        projects={projects}
        onLoadProject={handleLoadProject}
        onCreateNew={handleCreateNew}
        onDeleteProject={deleteProject}
      />
    );
  }

  return (
    <EditorView
      key={activeProject.id}
      project={activeProject}
      initialFile={initialFile} // <-- Pass the initial file as a prop
      onSave={handleSaveProject}
      onClose={handleCloseEditor}
    />
  );
}

export default App;