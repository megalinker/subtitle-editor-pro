import { useState, useCallback } from 'react';
import { Project } from './types';

const STORAGE_KEY = 'subtitlerProjects';

const getProjectsFromStorage = (): Project[] => {
    try {
        const rawData = localStorage.getItem(STORAGE_KEY);
        return rawData ? JSON.parse(rawData) : [];
    } catch (error) {
        console.error("Failed to parse projects from localStorage", error);
        return [];
    }
};

const saveProjectsToStorage = (projects: Project[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};

export const useProjects = () => {
    const [projects, setProjects] = useState<Project[]>(getProjectsFromStorage());

    const createNewProject = useCallback((file: File): Project => {
        const newProject: Project = {
            id: Date.now().toString(),
            name: file.name,
            fileSignature: {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
            },
            segments: [],
            speakerMap: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const updatedProjects = [...projects, newProject];
        setProjects(updatedProjects);
        saveProjectsToStorage(updatedProjects);
        return newProject;
    }, [projects]);

    const updateProject = useCallback((updatedProject: Project) => {
        const projectIndex = projects.findIndex(p => p.id === updatedProject.id);
        if (projectIndex === -1) return;

        const newProjects = [...projects];
        newProjects[projectIndex] = { ...updatedProject, updatedAt: Date.now() };
        setProjects(newProjects);
        saveProjectsToStorage(newProjects);
    }, [projects]);

    const deleteProject = useCallback((projectId: string) => {
        const confirmed = window.confirm("Are you sure you want to delete this project? This cannot be undone.");
        if (confirmed) {
            const newProjects = projects.filter(p => p.id !== projectId);
            setProjects(newProjects);
            saveProjectsToStorage(newProjects);
        }
    }, [projects]);

    return { projects, createNewProject, updateProject, deleteProject };
};