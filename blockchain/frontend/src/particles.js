// src/particles.js

const particleConfig = {
  fullScreen: {
    enable: false
  },
  background: {
    color: {
      value: "transparent"
    }
  },
  particles: {
    number: {
      value: 60,
      density: {
        enable: true,
        area: 800
      }
    },
    color: {
      value: "#e6c15b"
    },
    shape: {
      type: "circle"
    },
    opacity: {
      value: 0.3
    },
    size: {
      value: 2,
      random: true
    },
    links: {
      enable: true,
      distance: 120,
      color: "#e6c15b",
      opacity: 0.2,
      width: 0.8
    },
    move: {
      enable: true,
      speed: 0.3,
      direction: "none",
      outModes: "bounce"
    }
  },
  interactivity: {
    detectsOn: "canvas",
    events: {
      onHover: {
        enable: true,
        mode: "repulse"
      },
      resize: true
    },
    modes: {
      repulse: {
        distance: 70,
        duration: 0.4
      }
    }
  },
  detectRetina: true
};

export default particleConfig;