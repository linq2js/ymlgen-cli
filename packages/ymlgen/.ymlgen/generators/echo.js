module.exports = ({ write, data }) =>
  write("const data = " + JSON.stringify(data));
