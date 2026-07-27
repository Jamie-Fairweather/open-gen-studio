//! Opaque JSON for Specta export.
//!
//! `serde_json::Value` is infinitely recursive when Specta tries to inline it.
//! Use `#[specta(type = specta_typescript::Any)]` on fields, or these wrappers
//! at command boundaries.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::{datatype::DataType, Type, Types};
use specta_typescript::Any;
use std::collections::HashMap;

/// Transparent JSON value that Specta exports as `any`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct JsonValue(pub Value);

impl Type for JsonValue {
    fn definition(types: &mut Types) -> DataType {
        <Any as Type>::definition(types)
    }
}

impl From<Value> for JsonValue {
    fn from(value: Value) -> Self {
        Self(value)
    }
}

impl From<JsonValue> for Value {
    fn from(value: JsonValue) -> Self {
        value.0
    }
}

/// Transparent JSON object map that Specta exports as `any`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub struct JsonMap(pub HashMap<String, Value>);

impl Type for JsonMap {
    fn definition(types: &mut Types) -> DataType {
        <Any as Type>::definition(types)
    }
}

impl From<HashMap<String, Value>> for JsonMap {
    fn from(value: HashMap<String, Value>) -> Self {
        Self(value)
    }
}

impl From<JsonMap> for HashMap<String, Value> {
    fn from(value: JsonMap) -> Self {
        value.0
    }
}
