import './style.css';
import { BackgroundScene } from './three/BackgroundScene.js';
import { SkillsScene } from './three/SkillsScene.js';
import { ProjectGallery } from './three/ProjectGallery.js';

const canvas = document.querySelector('#webgl');
const heroSection = document.querySelector('#home');

if (!canvas || !heroSection) {
  throw new Error('Landing page canvas or section was not found.');
}

const backgroundScene = new BackgroundScene(canvas, heroSection);
backgroundScene.start();

// Skills Showcase — interactive 3D skill nodes
const skillsContainer = document.querySelector('#skills-three-container');
const skillsCanvas = document.querySelector('#skills-webgl');
let skillsScene = null;
if (skillsContainer && skillsCanvas) {
  skillsScene = new SkillsScene(skillsContainer, skillsCanvas);
}

// Project Gallery — interactive 3D coverflow carousel
const galleryContainer = document.querySelector('#project-gallery-3d');
const galleryCanvas = document.querySelector('#projects-webgl');
let projectGallery = null;
if (galleryContainer && galleryCanvas) {
  projectGallery = new ProjectGallery(galleryContainer, galleryCanvas, {
    prevButton: document.querySelector('#gallery-prev'),
    nextButton: document.querySelector('#gallery-next'),
    modal: document.querySelector('#project-detail-modal'),
    dataSource: document.querySelector('#projects-data-source'),
  });
}

window.addEventListener('beforeunload', () => {
  backgroundScene.dispose();
  skillsScene?.dispose();
  projectGallery?.dispose();
});