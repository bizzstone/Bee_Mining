module.exports = {
  apps: [
    { name: "mine-1", script: "index.cjs", args: "1", restart_delay: 5000 },
    { name: "mine-2", script: "index.cjs", args: "2", restart_delay: 5000 },
    { name: "mine-3", script: "index.cjs", args: "3", restart_delay: 5000 },
    { name: "mine-4", script: "index.cjs", args: "4", restart_delay: 5000 },
    { name: "mine-5", script: "index.cjs", args: "5", restart_delay: 5000 }
  ]
};