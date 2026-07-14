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

// Contact Form - web3forms API Call
const form = document.getElementById('contactForm');
const submitBtn = form.querySelector('button[type="submit');

form.addEventListener('submit', async(e)=>{
  e.preventDefault();

  const formData = new FormData(form);
  formData.append("access_key", "3f601a47-7d58-4494-92f0-7e1e8ace37c4");
  
  const originalText = submitBtn.textContent;

  submitBtn.textContent = "Sending...";
  submitBtn.disabled = true;

  try{
    const response = await fetch("https://api.web3forms.com/submit", {
      method:"POST",
      body: formData
    });

    const data = await response.json();

    if(response.ok){
      alert("Success! Your message has been sent.");
      form.reset();
    }
    else{
      alert("Error: " + data.message);
    }
  } catch(error){
    alert("Something went wrong. Please try again.")
  }finally{
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});


// Button dropdown
const btns = document.querySelectorAll(".social-link");

btns.forEach(btn => {
    btn.addEventListener("click", e => {
        e.stopPropagation();

        document.querySelectorAll(".drop-menu").forEach(menu =>
            menu.classList.remove("active")
        );

        btn.nextElementSibling.classList.add("active");
    });
});

window.addEventListener("click", () => {
    document.querySelectorAll(".drop-menu").forEach(menu =>
        menu.classList.remove("active")
    );
});