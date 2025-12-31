// Mock for xlsx library
export const read = jest.fn();
export const utils = {
  sheet_to_json: jest.fn(),
};
export default { read, utils };
