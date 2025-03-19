import { uploadSchema, getSchema } from './firebase';

/**
 * Interface for a field in a data schema
 */
export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'reference';
  required?: boolean;
  description?: string;
  defaultValue?: any;
  validationRules?: string[];
  subFields?: SchemaField[]; // For array or object types
  referenceType?: string;    // For reference types
}

/**
 * Interface for a data schema
 */
export interface DataSchema {
  name: string;
  description?: string;
  fields: SchemaField[];
  timestamps?: boolean;
  indexes?: Array<string | Array<string>>;
  relationships?: SchemaRelationship[];
}

/**
 * Interface for defining relationships between schemas
 */
export interface SchemaRelationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  fieldName: string;
}

/**
 * Convert a data schema to Firestore rules
 */
export function generateFirestoreRules(schema: DataSchema): string {
  let rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Base rules
    match /${schema.name}/{documentId} {
      allow read: if true;  // Customize as needed
      allow write: if true && validateDocument();  // Customize as needed
      
      function validateDocument() {
        let incomingData = request.resource.data;
        return validateSchema(incomingData);
      }
      
      function validateSchema(data) {
        return ${generateValidationRules(schema)};
      }
    }
  }
}`;
  
  return rules;
}

/**
 * Generate validation rules from schema
 */
function generateValidationRules(schema: DataSchema): string {
  const validations: string[] = [];
  
  schema.fields.forEach(field => {
    if (field.required) {
      validations.push(`'${field.name}' in data`);
    }
    
    switch (field.type) {
      case 'string':
        validations.push(`!('${field.name}' in data) || data.${field.name} is string`);
        break;
      case 'number':
        validations.push(`!('${field.name}' in data) || data.${field.name} is number`);
        break;
      case 'boolean':
        validations.push(`!('${field.name}' in data) || data.${field.name} is bool`);
        break;
      case 'date':
        validations.push(`!('${field.name}' in data) || data.${field.name} is timestamp`);
        break;
      case 'array':
        validations.push(`!('${field.name}' in data) || data.${field.name} is list`);
        break;
      case 'object':
        validations.push(`!('${field.name}' in data) || data.${field.name} is map`);
        break;
    }
  });
  
  return validations.join(' && ');
}

/**
 * Generate TypeScript interfaces from a schema
 */
export function generateTypeScriptInterface(schema: DataSchema): string {
  let output = `export interface ${capitalizeFirstLetter(schema.name)} {\n`;
  
  schema.fields.forEach(field => {
    const required = field.required ? '' : '?';
    let tsType = 'any';
    
    switch (field.type) {
      case 'string':
        tsType = 'string';
        break;
      case 'number':
        tsType = 'number';
        break;
      case 'boolean':
        tsType = 'boolean';
        break;
      case 'date':
        tsType = 'Date';
        break;
      case 'array':
        if (field.subFields && field.subFields[0]) {
          const subType = getTypeScriptType(field.subFields[0]);
          tsType = `${subType}[]`;
        } else {
          tsType = 'any[]';
        }
        break;
      case 'object':
        if (field.subFields) {
          tsType = '{\n';
          field.subFields.forEach(subField => {
            const subRequired = subField.required ? '' : '?';
            const subType = getTypeScriptType(subField);
            tsType += `    ${subField.name}${subRequired}: ${subType};\n`;
          });
          tsType += '  }';
        } else {
          tsType = 'Record<string, any>';
        }
        break;
      case 'reference':
        if (field.referenceType) {
          tsType = `FirestoreReference<${capitalizeFirstLetter(field.referenceType)}>`;
        } else {
          tsType = 'FirestoreReference<any>';
        }
        break;
    }
    
    const description = field.description ? `  // ${field.description}\n` : '';
    output += `${description}  ${field.name}${required}: ${tsType};\n`;
  });
  
  if (schema.timestamps) {
    output += '  createdAt: Date;\n';
    output += '  updatedAt: Date;\n';
  }
  
  output += '}';
  return output;
}

function getTypeScriptType(field: SchemaField): string {
  switch (field.type) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'date': return 'Date';
    case 'array': return 'any[]';
    case 'object': return 'Record<string, any>';
    case 'reference': 
      if (field.referenceType) {
        return `FirestoreReference<${capitalizeFirstLetter(field.referenceType)}>`;
      }
      return 'FirestoreReference<any>';
    default: return 'any';
  }
}

function capitalizeFirstLetter(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Save a schema to Firebase
 */
export async function saveSchema(schema: DataSchema): Promise<string> {
  return await uploadSchema(schema.name, schema);
}

/**
 * Retrieve a schema from Firebase
 */
export async function retrieveSchema(schemaName: string): Promise<DataSchema> {
  const data = await getSchema(schemaName);
  return data.schema as DataSchema;
}

/**
 * Parse a string to create a data schema
 * This can be used to parse user input from chat
 */
export function parseSchemaFromText(text: string): DataSchema | null {
  try {
    // Basic regex to find schema definition blocks
    const schemaMatch = text.match(/schema\s+(\w+)(?:\s+{([^}]+)})?/i);
    
    if (!schemaMatch) return null;
    
    const schemaName = schemaMatch[1];
    const schemaBody = schemaMatch[2] || '';
    
    // Parse fields
    const fieldRegex = /(\w+)\s*:\s*(\w+)(?:\s*\(([^)]*)\))?/g;
    const fields: SchemaField[] = [];
    let match;
    
    while ((match = fieldRegex.exec(schemaBody)) !== null) {
      const fieldName = match[1];
      const fieldType = match[2].toLowerCase() as SchemaField['type'];
      const fieldOptions = match[3] || '';
      
      const field: SchemaField = {
        name: fieldName,
        type: fieldType
      };
      
      // Check if field is required
      if (fieldOptions.includes('required')) {
        field.required = true;
      }
      
      // Check for description
      const descMatch = fieldOptions.match(/description\s*:\s*["']([^"']*)["']/i);
      if (descMatch) {
        field.description = descMatch[1];
      }
      
      fields.push(field);
    }
    
    return {
      name: schemaName,
      fields: fields
    };
  } catch (error) {
    console.error('Error parsing schema from text:', error);
    return null;
  }
} 